// Публичный интерфейс модуля брака и компенсации (docs/REPOSITORY_STRUCTURE.md).

export type { ProductionOrderDefect, ProductionOrderDefectDraft, DefectCompensation, DefectCompensationDraft } from "./domain/defect";
export {
  assertDefectDraftQuantityValid,
  assertDefectDraftsMatchTotal,
  assertDefectVariantBelongsToOrder,
  assertNoExistingDefectsForQcResult,
  assertCompensationQuantityValid,
  assertNoOvercompensation,
  assertCompensatingOrderReferencesDefectSource,
  assertCompensatingVariantIsRework,
} from "./domain/defect";
export { DomainError } from "./domain/errors";

export type {
  NewProductionOrderDefectInput,
  ProductionOrderDefectRepository,
  NewDefectCompensationInput,
  DefectCompensationRepository,
  ProductionOrderVariantInfo,
  ProductionOrderInfo,
  ProductionOrderLookupPort,
} from "./application/ports";
export {
  recordDefects,
  validateDefectDrafts,
  type RecordDefectsDeps,
  type RecordDefectsInput,
  type ValidateDefectDraftsInput,
} from "./application/record-defects";
export {
  createDefectCompensation,
  type CreateDefectCompensationDeps,
  type CreateDefectCompensationInput,
} from "./application/create-defect-compensation";

export { DrizzleProductionOrderDefectRepository, DrizzleDefectCompensationRepository } from "./infrastructure/drizzle-defect-repository";
