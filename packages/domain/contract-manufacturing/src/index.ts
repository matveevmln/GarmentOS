// Публичный интерфейс модуля Contract Manufacturing (docs/REPOSITORY_STRUCTURE.md).

export type { Workshop, WorkshopStatus } from "./domain/workshop";
export type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderVariant,
  ProductionOrderVariantDraft,
  ProductionOrderVariantType,
  WorkshopReportableStatus,
} from "./domain/production-order";
export {
  assertVariantsMatchPlannedQuantity,
  assertCostSnapshotNotYetSet,
  assertReworkPriceIsZero,
  assertReworkRequiresSource,
  assertSourceOrderIsNotSelf,
  assertSourceOrderExists,
  assertCanComplete,
  assertCanRollbackStatus,
  assertCanCancel,
} from "./domain/production-order";
export { DomainError } from "./domain/errors";

export type {
  BomApprovalPort,
  NewProductionOrderInput,
  NewWorkshopInput,
  ProductionOrderRepository,
  QcResultLookupPort,
  WorkshopPatch,
  WorkshopRepository,
} from "./application/ports";
export { createWorkshop, type CreateWorkshopDeps, type CreateWorkshopInput } from "./application/create-workshop";
export { updateWorkshop, type UpdateWorkshopDeps, type UpdateWorkshopInput } from "./application/update-workshop";
export {
  createProductionOrderDraft,
  type CreateProductionOrderDeps,
  type CreateProductionOrderInput,
} from "./application/create-production-order";
export {
  createProductionOrderFromSpecification,
  type CreateProductionOrderFromSpecificationDeps,
  type CreateProductionOrderFromSpecificationInput,
} from "./application/create-production-order-from-specification";
export {
  confirmProductionOrder,
  type ConfirmProductionOrderDeps,
  type ConfirmProductionOrderInput,
} from "./application/confirm-production-order";
export {
  linkWorkshopTelegramChat,
  type LinkWorkshopTelegramChatDeps,
  type LinkWorkshopTelegramChatInput,
} from "./application/link-workshop-telegram-chat";
export {
  updateProductionOrderStatusFromWorkshop,
  type UpdateProductionOrderStatusFromWorkshopDeps,
  type UpdateProductionOrderStatusFromWorkshopInput,
} from "./application/update-production-order-status-from-workshop";
export {
  updateProductionOrderStatus,
  type UpdateProductionOrderStatusDeps,
  type UpdateProductionOrderStatusInput,
} from "./application/update-production-order-status";
export {
  captureProductionOrderCostSnapshot,
  type CaptureProductionOrderCostSnapshotDeps,
  type CaptureProductionOrderCostSnapshotInput,
} from "./application/capture-production-order-cost-snapshot";
export {
  receiveProductionOrder,
  type ReceiveProductionOrderDeps,
  type ReceiveProductionOrderInput,
} from "./application/receive-production-order";
export {
  completeProductionOrder,
  type CompleteProductionOrderDeps,
  type CompleteProductionOrderInput,
} from "./application/complete-production-order";
export {
  rollbackProductionOrderStatus,
  type RollbackProductionOrderStatusDeps,
  type RollbackProductionOrderStatusInput,
  type RollbackProductionOrderStatusResult,
} from "./application/rollback-production-order-status";
export {
  cancelProductionOrder,
  type CancelProductionOrderDeps,
  type CancelProductionOrderInput,
  type CancelProductionOrderResult,
} from "./application/cancel-production-order";

export {
  DrizzleProductionOrderRepository,
  DrizzleWorkshopRepository,
} from "./infrastructure/drizzle-contract-manufacturing-repository";
