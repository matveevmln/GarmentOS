// Публичный интерфейс модуля ОТК (docs/REPOSITORY_STRUCTURE.md).

export type { QcResult, QcResultDraft } from "./domain/qc-result";
export {
  assertNoExistingResult,
  assertProductionOrderReceived,
  assertQcQuantitiesValid,
} from "./domain/qc-result";
export { DomainError } from "./domain/errors";

export type {
  NewQcResultInput,
  ProductionOrderLookupPort,
  QcResultRepository,
} from "./application/ports";
export {
  recordQcResult,
  type RecordQcResultDeps,
  type RecordQcResultInput,
} from "./application/record-qc-result";

export { DrizzleQcResultRepository } from "./infrastructure/drizzle-qc-repository";
