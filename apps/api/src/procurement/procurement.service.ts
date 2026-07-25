import { Inject, Injectable } from "@nestjs/common";
import {
  confirmPurchaseOrder,
  createMaterial,
  createPurchaseOrderDraft,
  createSupplier,
  type Material,
  type MaterialRepository,
  type PurchaseOrder,
  type PurchaseOrderRepository,
  type Supplier,
  type SupplierRepository,
} from "@garmentos/domain-procurement";
import type { CreateMaterialDto, CreatePurchaseOrderDto, CreateSupplierDto } from "@garmentos/shared-types";
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
  ) {}

  async createMaterial(companyId: string, input: CreateMaterialDto): Promise<Material> {
    return createMaterial({ materials: this.materials }, { ...input, companyId });
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
}
