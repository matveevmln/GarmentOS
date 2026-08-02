// Публичный интерфейс модуля Warehouse & Inventory (docs/REPOSITORY_STRUCTURE.md).

export type { Warehouse, WarehouseType } from "./domain/warehouse";
export type { StockItem, StockMovement, StockMovementType } from "./domain/stock";
export type { MaterialStockItem, MaterialStockMovement, MaterialStockMovementType } from "./domain/material-stock";
export type { Shipment, ShipmentItem, ShipmentItemDraft, ShipmentStatus } from "./domain/shipment";
export type { InventoryCount, InventoryCountItem, InventoryCountStatus } from "./domain/inventory-count";
export { DomainError } from "./domain/errors";

export type {
  InventoryCountRepository,
  MaterialStockMovementMeta,
  MaterialStockRepository,
  NewShipmentInput,
  NewWarehouseInput,
  ShipmentRepository,
  StockMovementMeta,
  StockRepository,
  WarehouseRepository,
} from "./application/ports";

export { createWarehouse, type CreateWarehouseDeps, type CreateWarehouseInput } from "./application/create-warehouse";
export { receiveStock, type ReceiveStockDeps, type ReceiveStockInput } from "./application/receive-stock";
export {
  receiveMaterialStock,
  type ReceiveMaterialStockDeps,
  type ReceiveMaterialStockInput,
} from "./application/receive-material-stock";
export {
  consumeMaterialStock,
  type ConsumeMaterialStockDeps,
  type ConsumeMaterialStockInput,
} from "./application/consume-material-stock";
export { dispatchStock, type DispatchStockDeps, type DispatchStockInput } from "./application/dispatch-stock";
export { transferStock, type TransferStockDeps, type TransferStockInput } from "./application/transfer-stock";
export {
  releaseReservation,
  reserveStock,
  type StockReservationDeps,
  type StockReservationInput,
} from "./application/reservation";
export { createShipment, type CreateShipmentDeps, type CreateShipmentInput } from "./application/create-shipment";
export { dispatchShipment, type DispatchShipmentDeps, type DispatchShipmentInput } from "./application/dispatch-shipment";
export {
  markShipmentDelivered,
  type MarkShipmentDeliveredDeps,
  type MarkShipmentDeliveredInput,
} from "./application/mark-shipment-delivered";
export {
  createInventoryCount,
  type CreateInventoryCountDeps,
  type CreateInventoryCountInput,
} from "./application/create-inventory-count";
export {
  recordInventoryCountItem,
  type RecordInventoryCountItemDeps,
  type RecordInventoryCountItemInput,
} from "./application/record-inventory-count-item";
export {
  completeInventoryCount,
  type CompleteInventoryCountDeps,
  type CompleteInventoryCountInput,
} from "./application/complete-inventory-count";

export {
  DrizzleWarehouseRepository,
  DrizzleStockRepository,
  DrizzleMaterialStockRepository,
} from "./infrastructure/drizzle-warehouse-repository";
export { DrizzleShipmentRepository } from "./infrastructure/drizzle-shipment-repository";
export { DrizzleInventoryCountRepository } from "./infrastructure/drizzle-inventory-count-repository";
