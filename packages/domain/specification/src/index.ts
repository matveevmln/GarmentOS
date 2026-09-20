// Публичный интерфейс модуля Specification (docs/REPOSITORY_STRUCTURE.md).

export type {
  Specification,
  SpecificationItem,
  SpecificationItemDraft,
  SpecificationSnapshot,
  SpecificationStatus,
} from "./domain/specification";
export {
  SPECIFICATION_PREPAYMENT_PERCENT,
  assertCanApprove,
  assertCanEdit,
  assertHasItems,
  assertIsDraft,
  assertIsNewFlowSpecification,
  assertValidItem,
  computePrepaymentAmount,
  computeSpecificationTotals,
} from "./domain/specification";
export { DomainError } from "./domain/errors";

export type {
  NewSpecificationInput,
  ProductLookupPort,
  ProductVariantLookupPort,
  SpecificationRepository,
  SpecificationUpdatePatch,
  WorkshopLookupPort,
} from "./application/ports";

export {
  createSpecificationDraft,
  type CreateSpecificationDraftDeps,
  type CreateSpecificationDraftInput,
} from "./application/create-specification-draft";
export {
  createSpecificationFromExisting,
  type CreateSpecificationFromExistingDeps,
  type CreateSpecificationFromExistingInput,
} from "./application/create-specification-from-existing";
export {
  approveSpecification,
  type ApproveSpecificationDeps,
  type ApproveSpecificationInput,
  type ApproveSpecificationLine,
} from "./application/approve-specification";
export {
  createSpecificationFromProductionOrder,
  type CreateSpecificationFromProductionOrderDeps,
  type CreateSpecificationFromProductionOrderInput,
} from "./application/create-specification-from-production-order";
export {
  updateSpecification,
  type UpdateSpecificationDeps,
  type UpdateSpecificationInput,
} from "./application/update-specification";
export {
  cancelSpecification,
  type CancelSpecificationDeps,
  type CancelSpecificationInput,
} from "./application/cancel-specification";

export { DrizzleSpecificationRepository } from "./infrastructure/drizzle-specification-repository";
