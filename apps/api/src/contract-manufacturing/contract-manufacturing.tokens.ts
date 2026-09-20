// Токены DI для доменных портов Contract Manufacturing
// (packages/domain/contract-manufacturing — application/ports.ts).
export const WORKSHOP_REPOSITORY = Symbol("WORKSHOP_REPOSITORY");
export const PRODUCTION_ORDER_REPOSITORY = Symbol("PRODUCTION_ORDER_REPOSITORY");
export const BOM_APPROVAL_PORT = Symbol("BOM_APPROVAL_PORT");
export const QC_RESULT_LOOKUP_PORT = Symbol("QC_RESULT_LOOKUP_PORT");
