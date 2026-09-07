// Публичный интерфейс модуля Cutting (docs/REPOSITORY_STRUCTURE.md).

export type {
  CuttingExecutorType,
  CuttingOrder,
  CuttingOrderMaterial,
  CuttingOrderResult,
  CuttingOrderStatus,
} from "./domain/cutting-order";
export {
  assertCanCancel,
  assertCanCorrectResult,
  assertCanIssue,
  assertCanRecordResult,
  assertExecutorConsistency,
  assertProductionOrderCanBeCut,
} from "./domain/cutting-order";
export { DomainError } from "./domain/errors";

export type {
  CuttingOrderMaterialFactInput,
  CuttingOrderRepository,
  CuttingOrderResultFactInput,
  MaterialStockPort,
  NewCuttingOrderInput,
  NewCuttingOrderMaterialInput,
  NewCuttingOrderResultInput,
  ProductionOrderSnapshotPort,
} from "./application/ports";

export {
  createCuttingOrder,
  type CreateCuttingOrderDeps,
  type CreateCuttingOrderInput,
} from "./application/create-cutting-order";
export {
  issueCuttingOrder,
  type IssueCuttingOrderDeps,
  type IssueCuttingOrderInput,
} from "./application/issue-cutting-order";
export {
  cancelCuttingOrder,
  type CancelCuttingOrderDeps,
  type CancelCuttingOrderInput,
} from "./application/cancel-cutting-order";
export {
  CUTTING_REFERENCE_TYPE,
  correctCuttingFact,
  recordCuttingFact,
  type CorrectCuttingFactResult,
  type CuttingFactDeps,
  type CuttingFactInput,
  type CuttingFactResult,
  type StockShortage,
} from "./application/record-cutting-fact";

export { DrizzleCuttingOrderRepository } from "./infrastructure/drizzle-cutting-repository";
