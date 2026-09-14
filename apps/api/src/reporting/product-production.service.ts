import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { specifications as specificationsTable, type Database } from "@garmentos/db-schema";
import type { BatchCardDto, ProductProductionResponseDto } from "@garmentos/shared-types";
import { and, eq, inArray } from "drizzle-orm";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DATABASE_CONNECTION } from "../database/database.module";
import { DocumentService } from "../document/document.service";

// «История производства модели» (Model-first Minimal Core, владелец
// проекта, 2026-09-12, ПРОМПТ №06.1) — Модель → Спецификации → Партии →
// История в одном ответе, тот же принцип композиции, что и
// batch-passport.service.ts (Reporting/BI поверх Catalog + Contract
// Manufacturing + Document Engine, только чтение).
//
// Партии модели читаются напрямую по productId (production_orders.product_id
// существовал ещё до Этапа 3 «Production Master») — партии, размещённые
// вручную или до появления спецификаций, тоже попадают в историю, а не
// только те, что созданы через specificationId.
@Injectable()
export class ProductProductionService {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly documentService: DocumentService,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
  ) {}

  async getProduction(companyId: string, productId: string): Promise<ProductProductionResponseDto> {
    // Принадлежность модели компании проверяется ПЕРВОЙ и до любой другой
    // выборки (tenant isolation, ПРОМПТ №06.1 §20): иначе чужой productId
    // вернул бы пустой список партий вместо 404 и тем самым подтвердил бы
    // сам факт существования чужой модели.
    const product = await this.catalogService.findProductById(companyId, productId);
    if (!product) {
      throw new NotFoundException({
        statusCode: 404,
        code: "PRODUCT_NOT_FOUND",
        message: `Модель ${productId} не найдена`,
      });
    }

    const [orders, variants, sizes, photoDocuments] = await Promise.all([
      this.contractManufacturingService.listProductionOrdersByProduct(companyId, productId),
      this.catalogService.listProductVariants(companyId, productId),
      this.catalogService.listProductSizes(companyId, productId),
      // Фото — свойство МОДЕЛИ, не партии (ПРОМПТ №06.1 §7): один запрос на
      // всю историю, а не один на партию — иначе список из N партий сделал
      // бы N запросов документов ради одной и той же картинки.
      this.documentService.listForEntity(companyId, "product", productId),
    ]);

    const photoDocument = photoDocuments.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion) ?? null;

    // Порядок размеров — из раскладки модели (product_sizes.sortOrder), тот
    // же приоритет, что и в ContractManufacturingService.previewProductionOrderVariants:
    // размеры без явной раскладки идут следом в порядке появления.
    const orderedSizes = sizes.map((row) => row.size);
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    // Цеха и спецификации — по уникальным id, встретившимся в партиях этой
    // модели, не по одному запросу на партию (без N+1).
    const workshopIds = [...new Set(orders.map((order) => order.workshopId))];
    const specificationIds = [...new Set(orders.flatMap((order) => (order.specificationId ? [order.specificationId] : [])))];

    const [workshopEntries, specNumberBySpecId] = await Promise.all([
      Promise.all(
        workshopIds.map(async (workshopId) => {
          const workshop = await this.contractManufacturingService.findWorkshopById(companyId, workshopId);
          return [workshopId, workshop?.name ?? "—"] as const;
        }),
      ),
      this.loadSpecNumbers(companyId, specificationIds),
    ]);
    const workshopNameById = new Map(workshopEntries);

    const batches: BatchCardDto[] = orders.map((order) => {
      // Размеры без раскладки идут следом, в порядке появления среди
      // вариантов этой партии — тот же принцип, что и в previewProductionOrderVariants.
      const sizesForOrder = [...orderedSizes];
      for (const line of order.variants) {
        const variant = variantById.get(line.productVariantId);
        if (variant && !sizesForOrder.includes(variant.size)) sizesForOrder.push(variant.size);
      }

      const colorOrder: string[] = [];
      const byColor = new Map<string, Map<string, number>>();
      for (const line of order.variants) {
        const variant = variantById.get(line.productVariantId);
        if (!variant) continue;
        if (!byColor.has(variant.color)) {
          byColor.set(variant.color, new Map());
          colorOrder.push(variant.color);
        }
        const sizeMap = byColor.get(variant.color)!;
        sizeMap.set(variant.size, (sizeMap.get(variant.size) ?? 0) + Number(line.quantity));
      }

      const breakdown = colorOrder.map((color) => {
        const sizeMap = byColor.get(color)!;
        const sizesForColor = sizesForOrder
          .filter((size) => sizeMap.has(size))
          .map((size) => ({ size, quantity: sizeMap.get(size)! }));
        return {
          color,
          quantity: sizesForColor.reduce((sum, row) => sum + row.quantity, 0),
          sizes: sizesForColor,
        };
      });

      return {
        id: order.id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status,
        plannedQuantity: order.plannedQuantity,
        dueDate: order.dueDate,
        productId: order.productId,
        productName: product.name,
        photoDocumentId: photoDocument?.id ?? null,
        workshopName: workshopNameById.get(order.workshopId) ?? "—",
        specificationId: order.specificationId,
        specNumber: order.specificationId ? (specNumberBySpecId.get(order.specificationId) ?? null) : null,
        breakdown,
      };
    });

    // Определения (ПРОМПТ №06.1 §1): totalProduced — фактически произведённое
    // (сумма receivedQuantity по вариантам принятых партий; если факт не
    // зафиксирован построчно — плановое количество строки, тот же
    // резервный принцип, что и в receiveProductionOrder), НЕ сумма заказанного
    // по всем партиям («заказано ≠ произведено»).
    const completedOrders = orders.filter((order) => order.status === "received");
    const totalProduced = completedOrders.reduce(
      (sum, order) =>
        sum + order.variants.reduce((lineSum, line) => lineSum + Number(line.receivedQuantity ?? line.quantity), 0),
      0,
    );
    const inProgressStatuses = new Set(["placed", "in_progress", "ready_for_pickup"]);
    const otherStatuses = new Set(["draft", "cancelled"]);

    return {
      aggregates: {
        totalProduced,
        batchCount: orders.length,
        completed: completedOrders.length,
        inProgress: orders.filter((order) => inProgressStatuses.has(order.status)).length,
        other: orders.filter((order) => otherStatuses.has(order.status)).length,
      },
      batches,
    };
  }

  // Спецификация-источник — прямой доступ через SpecificationModule здесь
  // недоступен (SpecificationModule импортирует ReportingModule ради
  // CostingService — обратный импорт создал бы цикл модулей, тот же случай,
  // что в batch-passport.service.ts). ContractManufacturingService не знает
  // структуры спецификации (opaque-ссылка, docs/PRINCIPLES.md принцип 2),
  // поэтому specNumber резолвится здесь так же, как в batch-passport —
  // прямым запросом к таблице specifications, но одним батчем на все id.
  private async loadSpecNumbers(companyId: string, specificationIds: string[]): Promise<Map<string, number | null>> {
    if (specificationIds.length === 0) return new Map();
    const rows = await this.db
      .select({ id: specificationsTable.id, specNumber: specificationsTable.specNumber })
      .from(specificationsTable)
      .where(and(eq(specificationsTable.companyId, companyId), inArray(specificationsTable.id, specificationIds)));
    return new Map(rows.map((row) => [row.id, row.specNumber]));
  }
}
