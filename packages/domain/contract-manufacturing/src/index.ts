// Публичный интерфейс модуля Contract Manufacturing (docs/REPOSITORY_STRUCTURE.md).

export type { Workshop, WorkshopStatus } from "./domain/workshop";
export type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderVariant,
  ProductionOrderVariantDraft,
} from "./domain/production-order";
export { DomainError } from "./domain/errors";

export type {
  BomApprovalPort,
  NewProductionOrderInput,
  NewWorkshopInput,
  ProductionOrderRepository,
  WorkshopRepository,
} from "./application/ports";
export { createWorkshop, type CreateWorkshopDeps, type CreateWorkshopInput } from "./application/create-workshop";
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
  DrizzleProductionOrderRepository,
  DrizzleWorkshopRepository,
} from "./infrastructure/drizzle-contract-manufacturing-repository";
