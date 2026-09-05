// Публичный интерфейс модуля Contract Manufacturing (docs/REPOSITORY_STRUCTURE.md).

export type { Workshop, WorkshopStatus } from "./domain/workshop";
export type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderVariant,
  ProductionOrderVariantDraft,
} from "./domain/production-order";
export { assertVariantsMatchPlannedQuantity } from "./domain/production-order";
export { DomainError } from "./domain/errors";

export type {
  BomApprovalPort,
  NewProductionOrderInput,
  NewWorkshopInput,
  ProductionOrderRepository,
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
  receiveProductionOrder,
  type ReceiveProductionOrderDeps,
  type ReceiveProductionOrderInput,
} from "./application/receive-production-order";

export {
  DrizzleProductionOrderRepository,
  DrizzleWorkshopRepository,
} from "./infrastructure/drizzle-contract-manufacturing-repository";
