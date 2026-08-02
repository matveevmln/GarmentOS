// Публичный интерфейс модуля Materials & Procurement (docs/REPOSITORY_STRUCTURE.md).

export type { Material, MaterialType, MaterialUnit } from "./domain/material";
export type { PartnerStatus, Supplier, SupplierType } from "./domain/supplier";
export type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderItemDraft,
  PurchaseOrderStatus,
} from "./domain/purchase-order";
export { DomainError } from "./domain/errors";

export type {
  MaterialRepository,
  NewMaterialInput,
  NewPurchaseOrderInput,
  NewSupplierInput,
  PurchaseOrderRepository,
  SupplierRepository,
} from "./application/ports";
export { createMaterial, type CreateMaterialDeps, type CreateMaterialInput } from "./application/create-material";
export { createSupplier, type CreateSupplierDeps, type CreateSupplierInput } from "./application/create-supplier";
export {
  createPurchaseOrderDraft,
  type CreatePurchaseOrderDeps,
  type CreatePurchaseOrderInput,
} from "./application/create-purchase-order";
export {
  confirmPurchaseOrder,
  type ConfirmPurchaseOrderDeps,
  type ConfirmPurchaseOrderInput,
} from "./application/confirm-purchase-order";
export {
  receivePurchaseOrder,
  type ReceivePurchaseOrderDeps,
  type ReceivePurchaseOrderInput,
} from "./application/receive-purchase-order";

export {
  DrizzleMaterialRepository,
  DrizzlePurchaseOrderRepository,
  DrizzleSupplierRepository,
} from "./infrastructure/drizzle-procurement-repository";
