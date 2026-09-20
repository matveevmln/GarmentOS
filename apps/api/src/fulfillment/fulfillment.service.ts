import { Injectable } from "@nestjs/common";
import type { ProductionOrderStatus } from "@garmentos/domain-contract-manufacturing";
import type { FulfillmentBatchListItemDto } from "@garmentos/shared-types";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DocumentService } from "../document/document.service";
import { QcService } from "../qc/qc.service";
import { SpecificationService } from "../specification/specification.service";

// Партия попадает в «Фулфилмент ОТК» (ПРОМПТ №3, раздел 10), как только она
// физически покинула цех в сторону фулфилмент-центра — тот же статус, что и
// список «в пути»/«принято».
const FULFILLMENT_STATUSES: ProductionOrderStatus[] = ["shipped_to_fulfillment", "received", "completed"];

// Read-model поверх уже существующих production_orders/production_order_qc_results/
// documents — не новая сущность (docs/PRINCIPLES.md, принцип 2: композиция
// чужих модулей на уровне apps/api, не параллельный доступ к чужим таблицам).
@Injectable()
export class FulfillmentService {
  constructor(
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly catalogService: CatalogService,
    private readonly qcService: QcService,
    private readonly documentService: DocumentService,
    private readonly specificationService: SpecificationService,
  ) {}

  async listBatches(companyId: string): Promise<FulfillmentBatchListItemDto[]> {
    const orders = (await this.contractManufacturingService.listProductionOrders(companyId)).filter((order) =>
      FULFILLMENT_STATUSES.includes(order.status),
    );

    const photoUrlByProduct = new Map<string, string | null>();
    const resolvePhotoUrl = async (productId: string): Promise<string | null> => {
      if (photoUrlByProduct.has(productId)) return photoUrlByProduct.get(productId) ?? null;
      const docs = await this.documentService.listForEntity(companyId, "product", productId);
      const photo = docs.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion);
      const url = photo ? `/documents/${photo.id}/file` : null;
      photoUrlByProduct.set(productId, url);
      return url;
    };

    return Promise.all(
      orders.map(async (order): Promise<FulfillmentBatchListItemDto> => {
        const [product, qcResult, photoUrl, specification] = await Promise.all([
          this.catalogService.findProductById(companyId, order.productId),
          this.qcService.tryFindByProductionOrder(companyId, order.id),
          resolvePhotoUrl(order.productId),
          // Резолвер знает про ОБЕ независимые связи Order↔Specification
          // (LEGACY через order.specificationId, NEW через
          // specifications.production_order_id) — не читаем order.specificationId
          // напрямую здесь, иначе NEW-поток показал бы "нет спецификации".
          this.specificationService.resolveOrderSpecificationLink(companyId, order),
        ]);

        return {
          productionOrderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          productId: order.productId,
          productName: product?.name ?? "",
          productPhotoUrl: photoUrl,
          specificationId: specification?.id ?? null,
          specNumber: specification?.specNumber ?? null,
          sentQuantity: order.plannedQuantity,
          receivedQuantity: qcResult ? String(qcResult.receivedQuantity) : null,
          defectQuantity: qcResult ? String(qcResult.defectQuantity) : null,
          qcStatus: qcResult ? "qc_recorded" : "awaiting_qc",
        };
      }),
    );
  }
}
