import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { invoices as invoicesTable, specifications as specificationsTable, type Database } from "@garmentos/db-schema";
import type { BatchPassportResponseDto, ProductionOrderCostSnapshot } from "@garmentos/shared-types";
import { and, eq } from "drizzle-orm";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DATABASE_CONNECTION } from "../database/database.module";
import { DocumentService } from "../document/document.service";
import { WarehouseService } from "../warehouse/warehouse.service";

function daysOverdue(dueDate: string | null, today: Date): number | null {
  if (!dueDate) return null;
  const diff = Math.floor((today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

// «Паспорт партии» (owner, 2026-08-03) — центральный экран заказа пошива,
// композиция Contract Manufacturing + Catalog + Document Engine + Finance
// в одном ответе (Reporting/BI, тот же принцип, что и AttentionService).
// Сознательно не включает разделы, у которых пока нет источника данных
// (материалы/ОТК/логистика — docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md,
// §26.5) — фронтенд получает только то, что реально существует, и сам решает,
// как показать отсутствующее честно (не эта функция выдумывает нули).
@Injectable()
export class BatchPassportService {
  constructor(
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly catalogService: CatalogService,
    private readonly documentService: DocumentService,
    private readonly warehouseService: WarehouseService,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
  ) {}

  async getPassport(companyId: string, productionOrderId: string): Promise<BatchPassportResponseDto> {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    if (!order) {
      throw new NotFoundException({
        statusCode: 404,
        code: "PRODUCTION_ORDER_NOT_FOUND",
        message: `Заказ пошива ${productionOrderId} не найден`,
      });
    }

    const [product, workshop, variants, documents, productDocuments, invoiceRows, specificationRow] = await Promise.all([
      this.catalogService.findProductById(companyId, order.productId),
      this.contractManufacturingService.findWorkshopById(companyId, order.workshopId),
      this.catalogService.listProductVariants(companyId, order.productId),
      this.documentService.listForEntity(companyId, "production_order", order.id),
      // Фото модели (тот же источник и то же правило, что в
      // ProductProductionService.getProduction) — UI-выравнивание паспорта
      // партии с BatchCard, не бизнес-логика.
      this.documentService.listForEntity(companyId, "product", order.productId),
      this.db
        .select({ id: invoicesTable.id, status: invoicesTable.status, amount: invoicesTable.amount, dueDate: invoicesTable.dueDate })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.productionOrderId, order.id))),
      // Спецификация-источник (Этап 3) — прямой запрос вместо
      // SpecificationService: SpecificationModule импортирует ReportingModule
      // (ради CostingService), обратный импорт создал бы цикл модулей.
      order.specificationId
        ? this.db
            .select({ id: specificationsTable.id, specNumber: specificationsTable.specNumber })
            .from(specificationsTable)
            .where(and(eq(specificationsTable.companyId, companyId), eq(specificationsTable.id, order.specificationId)))
            .limit(1)
        : Promise.resolve([]),
    ]);
    if (!product) {
      throw new NotFoundException({ statusCode: 404, code: "PRODUCT_NOT_FOUND", message: `Модель ${order.productId} не найдена` });
    }
    if (!workshop) {
      throw new NotFoundException({ statusCode: 404, code: "WORKSHOP_NOT_FOUND", message: `Цех ${order.workshopId} не найден` });
    }

    const variantById = new Map(variants.map((variant) => [variant.id, variant]));
    const orderVariants = order.variants.flatMap((row) => {
      const variant = variantById.get(row.productVariantId);
      if (!variant) return [];
      return [
        {
          productVariantId: row.productVariantId,
          size: variant.size,
          color: variant.color,
          quantity: row.quantity,
          variantType: row.variantType,
          unitPrice: row.unitPrice,
          receivedQuantity: row.receivedQuantity,
        },
      ];
    });

    // Хронология — только то, что система действительно фиксирует (создание,
    // Snapshot при подтверждении, каждая генерация документа), не выдуманная
    // лента "начали крой"/"закупили ткань" — этих событий система пока не
    // пишет (docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, §26.5).
    const timeline: BatchPassportResponseDto["timeline"] = [{ label: "Заказ создан", occurredAt: order.createdAt }];
    const snapshot = order.costSnapshot as ProductionOrderCostSnapshot | null;
    if (snapshot) {
      // Подписи ленты уходят прямо в интерфейс, поэтому здесь — язык
      // пользователя, а не внутренние названия механизмов.
      timeline.push({ label: "Подтверждён, данные партии зафиксированы", occurredAt: new Date(snapshot.capturedAt) });
    }
    for (const doc of documents) {
      timeline.push({ label: `Спецификация «${doc.title ?? doc.docType}» сформирована`, occurredAt: doc.createdAt });
    }
    if (order.receivedAt) {
      timeline.push({ label: "Партия принята на склад", occurredAt: order.receivedAt });
    }
    timeline.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    const photoDocument = productDocuments.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion) ?? null;

    const requirement = computeMaterialRequirement(snapshot, Number(order.plannedQuantity));
    const onHandByMaterial = await this.aggregateMaterialOnHand(
      companyId,
      requirement.map((row) => row.materialId),
    );

    return {
      id: order.id,
      status: order.status,
      plannedQuantity: order.plannedQuantity,
      agreedUnitPrice: order.agreedUnitPrice,
      orderNumber: order.orderNumber,
      specification: specificationRow[0] ? { id: specificationRow[0].id, specNumber: specificationRow[0].specNumber } : null,
      dueDate: order.dueDate,
      // "completed" (Global Completed Regression Audit, владелец проекта,
      // 2026-09-15) — терминальный статус наравне с "received"/"cancelled":
      // закрытая партия не показывает просрочку, даже если срок был нарушен
      // до закрытия.
      daysOverdue:
        order.status === "received" || order.status === "cancelled" || order.status === "completed"
          ? null
          : daysOverdue(order.dueDate, new Date()),
      createdAt: order.createdAt,
      product: { id: product.id, name: product.name, photoDocumentId: photoDocument?.id ?? null },
      workshop: {
        id: workshop.id,
        name: workshop.name,
        contractNumber: workshop.contractNumber,
        contractDate: workshop.contractDate,
        hasTelegramChat: workshop.telegramChatId !== null,
      },
      costSnapshot: snapshot,
      variants: orderVariants,
      documents,
      invoices: invoiceRows.map((row) => ({ id: row.id, status: row.status, amount: Number(row.amount), dueDate: row.dueDate })),
      timeline,
      materialRequirement: requirement.map((row) => {
        const onHand = onHandByMaterial.get(row.materialId) ?? 0;
        const isAvailable = onHand >= row.totalRequired;
        return { ...row, onHand, deficit: isAvailable ? 0 : row.totalRequired - onHand, isAvailable };
      }),
    };
  }

  // Остаток материала — АГРЕГАТ ПО ВСЕМ СКЛАДАМ КОМПАНИИ (Этап 3, владелец
  // проекта, 2026-09-12) — временная модель до появления понятия «склад
  // партии»; UI обязан явно подписать это как «Остаток по всем складам».
  // Переиспользует существующий WarehouseService.listMaterialStock (P0-3) по
  // каждому складу — новой агрегирующей таблицы не заводит.
  private async aggregateMaterialOnHand(companyId: string, materialIds: string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    if (materialIds.length === 0) return totals;
    const warehouses = await this.warehouseService.listWarehouses(companyId);
    for (const warehouse of warehouses) {
      const items = await this.warehouseService.listMaterialStock(companyId, warehouse.id);
      for (const item of items) {
        totals.set(item.materialId, (totals.get(item.materialId) ?? 0) + Number(item.quantityOnHand));
      }
    }
    return totals;
  }
}

// Потребность в материалах на партию — из норм, замороженных в момент
// подтверждения, и планового количества. Не хранится: величина полностью
// производная, а хранимое производное рассинхронизируется с источником.
//
// Партии, подтверждённые до появления норм в снимке, дают пустой список —
// подставлять текущие нормы модели нельзя, это ровно то, от чего защищает
// весь механизм: старая партия не должна пересчитываться задним числом.
export type MaterialRequirementBase = Array<
  Omit<BatchPassportResponseDto["materialRequirement"][number], "onHand" | "deficit" | "isAvailable">
>;

export function computeMaterialRequirement(
  snapshot: ProductionOrderCostSnapshot | null,
  plannedQuantity: number,
): MaterialRequirementBase {
  const norms = snapshot?.materialNorms ?? [];
  return norms.map((norm) => {
    const consumptionPerUnit = norm.quantityPerUnit * (1 + norm.wastePercent / 100);
    const totalRequired = consumptionPerUnit * plannedQuantity;
    // Стоимость считается только когда известны и цена, и валюта: иначе
    // получилось бы число без единицы измерения, которое кто-нибудь сложит
    // с суммой другого контура.
    const hasPrice = norm.lastPurchasePrice !== null && norm.priceCurrency !== null;
    return {
      materialId: norm.materialId,
      materialName: norm.materialName,
      materialType: norm.materialType,
      unit: norm.unit,
      quantityPerUnit: norm.quantityPerUnit,
      wastePercent: norm.wastePercent,
      consumptionPerUnit,
      totalRequired,
      unitPrice: hasPrice ? norm.lastPurchasePrice : null,
      currency: hasPrice ? norm.priceCurrency : null,
      totalCost: hasPrice ? totalRequired * (norm.lastPurchasePrice as number) : null,
    };
  });
}
