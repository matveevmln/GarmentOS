// Токены DI для доменных портов Cutting (packages/domain/cutting —
// application/ports.ts). Тот же паттерн, что и в catalog.tokens.ts.
export const CUTTING_ORDER_REPOSITORY = Symbol("CUTTING_ORDER_REPOSITORY");
export const CUTTING_PRODUCTION_ORDER_PORT = Symbol("CUTTING_PRODUCTION_ORDER_PORT");
export const CUTTING_MATERIAL_STOCK_PORT = Symbol("CUTTING_MATERIAL_STOCK_PORT");
