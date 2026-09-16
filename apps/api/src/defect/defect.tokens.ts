// Токены DI для доменных портов брака/компенсации
// (packages/domain/defect — application/ports.ts). Тот же паттерн, что qc.tokens.ts.
export const DEFECT_REPOSITORY = Symbol("DEFECT_REPOSITORY");
export const DEFECT_COMPENSATION_REPOSITORY = Symbol("DEFECT_COMPENSATION_REPOSITORY");
export const DEFECT_PRODUCTION_ORDER_PORT = Symbol("DEFECT_PRODUCTION_ORDER_PORT");
