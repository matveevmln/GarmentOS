import { Inject, Injectable } from "@nestjs/common";
import {
  confirmPurchaseOrder,
  createMaterial,
  createPurchaseOrderDraft,
  createSupplier,
  receivePurchaseOrder as receivePurchaseOrderUseCase,
  type Material,
  type MaterialRepository,
  type PurchaseOrder,
  type PurchaseOrderRepository,
  type Supplier,
  type SupplierRepository,
} from "@garmentos/domain-procurement";
import type { CreateMaterialDto, CreatePurchaseOrderDto, CreateSupplierDto } from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { WarehouseService } from "../warehouse/warehouse.service";
import { MATERIAL_REPOSITORY, PURCHASE_ORDER_REPOSITORY, SUPPLIER_REPOSITORY } from "./procurement.tokens";

// Тонкий presentation-адаптер поверх packages/domain/procurement
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в identity/catalog.
@Injectable()
export class ProcurementService {
  constructor(
    @Inject(MATERIAL_REPOSITORY) private readonly materials: MaterialRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly purchaseOrders: PurchaseOrderRepository,
    private readonly warehouseService: WarehouseService,
  ) {}

  async createMaterial(companyId: string, input: CreateMaterialDto): Promise<Material> {
    return createMaterial({ materials: this.materials }, { ...input, companyId });
  }

  async findMaterialById(companyId: string, id: string): Promise<Material | null> {
    return this.materials.findById(companyId, id);
  }

  async createSupplier(companyId: string, input: CreateSupplierDto): Promise<Supplier> {
    return createSupplier({ suppliers: this.suppliers }, { ...input, companyId });
  }

  async createPurchaseOrderDraft(companyId: string, input: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    return createPurchaseOrderDraft(
      { purchaseOrders: this.purchaseOrders, suppliers: this.suppliers },
      { ...input, companyId },
    );
  }

  async confirmPurchaseOrder(companyId: string, purchaseOrderId: string): Promise<PurchaseOrder> {
    return confirmPurchaseOrder({ purchaseOrders: this.purchaseOrders }, { companyId, purchaseOrderId });
  }

  // Приёмка закупки — материалы поступают на указанный склад (владелец
  // проекта, 2026-08-02): сначала статус закупки переводится в "received"
  // (доменный use case, не зависящий от Warehouse), затем по каждой позиции
  // увеличивается остаток материала. MVP: приёмка только "всё и сразу", без
  // частичных количеств по строкам.
  async receivePurchaseOrder(
    currentUser: AuthenticatedRequestUser,
    purchaseOrderId: string,
    warehouseId: string,
  ): Promise<PurchaseOrder> {
    const order = await receivePurchaseOrderUseCase(
      { purchaseOrders: this.purchaseOrders },
      { companyId: currentUser.companyId, purchaseOrderId },
    );

    for (const item of order.items) {
      await this.warehouseService.receiveMaterialStock(currentUser, warehouseId, item.materialId, Number(item.quantity), {
        referenceType: "purchase_order",
        referenceId: order.id,
      });
    }

    return order;
  }
}
