// Токены DI для доменных портов Warehouse & Inventory
// (packages/domain/warehouse — application/ports.ts).
export const WAREHOUSE_REPOSITORY = Symbol("WAREHOUSE_REPOSITORY");
export const STOCK_REPOSITORY = Symbol("STOCK_REPOSITORY");
export const MATERIAL_STOCK_REPOSITORY = Symbol("MATERIAL_STOCK_REPOSITORY");
export const SHIPMENT_REPOSITORY = Symbol("SHIPMENT_REPOSITORY");
export const INVENTORY_COUNT_REPOSITORY = Symbol("INVENTORY_COUNT_REPOSITORY");
