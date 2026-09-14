// Токены DI для доменных портов Specification (packages/domain/specification —
// application/ports.ts). Тот же паттерн, что и в qc.tokens.ts/cutting.tokens.ts.
export const SPECIFICATION_REPOSITORY = Symbol("SPECIFICATION_REPOSITORY");
export const SPECIFICATION_WORKSHOP_PORT = Symbol("SPECIFICATION_WORKSHOP_PORT");
export const SPECIFICATION_PRODUCT_PORT = Symbol("SPECIFICATION_PRODUCT_PORT");
export const SPECIFICATION_PRODUCT_VARIANT_PORT = Symbol("SPECIFICATION_PRODUCT_VARIANT_PORT");
