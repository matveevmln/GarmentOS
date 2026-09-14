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
  assertHasItems,
  assertIsDraft,
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

export { DrizzleSpecificationRepository } from "./infrastructure/drizzle-specification-repository";
