import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { invoices as invoicesTable, type Database } from "@garmentos/db-schema";
import type { BatchPassportResponseDto, ProductionOrderCostSnapshot } from "@garmentos/shared-types";
import { and, eq } from "drizzle-orm";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DATABASE_CONNECTION } from "../database/database.module";
import { DocumentService } from "../document/document.service";

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

    const [product, workshop, variants, documents, invoiceRows] = await Promise.all([
      this.catalogService.findProductById(companyId, order.productId),
      this.contractManufacturingService.findWorkshopById(companyId, order.workshopId),
      this.catalogService.listProductVariants(order.productId),
      this.documentService.listForEntity(companyId, "production_order", order.id),
      this.db
        .select({ id: invoicesTable.id, status: invoicesTable.status, amount: invoicesTable.amount, dueDate: invoicesTable.dueDate })
        .from(invoicesTable)
        .where(and(eq(invoicesTable.companyId, companyId), eq(invoicesTable.productionOrderId, order.id))),
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
      return [{ productVariantId: row.productVariantId, size: variant.size, color: variant.color, quantity: row.quantity }];
    });

    // Хронология — только то, что система действительно фиксирует (создание,
    // Snapshot при подтверждении, каждая генерация документа), не выдуманная
    // лента "начали крой"/"закупили ткань" — этих событий система пока не
    // пишет (docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, §26.5).
    const timeline: BatchPassportResponseDto["timeline"] = [{ label: "Заказ создан", occurredAt: order.createdAt }];
    const snapshot = order.costSnapshot as ProductionOrderCostSnapshot | null;
    if (snapshot) {
      timeline.push({ label: "Подтверждён, себестоимость зафиксирована (Snapshot)", occurredAt: new Date(snapshot.capturedAt) });
    }
    for (const doc of documents) {
      timeline.push({ label: `Спецификация «${doc.title ?? doc.docType}» сформирована`, occurredAt: doc.createdAt });
    }
    if (order.receivedAt) {
      timeline.push({ label: "Партия принята на склад", occurredAt: order.receivedAt });
    }
    timeline.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

    return {
      id: order.id,
      status: order.status,
      plannedQuantity: order.plannedQuantity,
      agreedUnitPrice: order.agreedUnitPrice,
      dueDate: order.dueDate,
      daysOverdue: order.status === "received" || order.status === "cancelled" ? null : daysOverdue(order.dueDate, new Date()),
      createdAt: order.createdAt,
      product: { id: product.id, name: product.name },
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
    };
  }
}
