import type { Warehouse, WarehouseType } from "../domain/warehouse";
import type { StockItem } from "../domain/stock";
import type { MaterialStockItem } from "../domain/material-stock";
import type { Shipment, ShipmentItemDraft, ShipmentStatus } from "../domain/shipment";
import type { InventoryCount, InventoryCountStatus } from "../domain/inventory-count";

export interface NewWarehouseInput {
  companyId: string;
  name: string;
  type: WarehouseType;
  country: string | null;
  workshopId: string | null;
  createdBy: string | null;
}

export interface WarehouseRepository {
  create(input: NewWarehouseInput): Promise<Warehouse>;
  findById(companyId: string, id: string): Promise<Warehouse | null>;
  // Нужен для авторезолва склада при проверке наличия материалов в
  // предпросмотре заказа пошива (Итерация 9, владелец проекта, 2026-08-02):
  // если у компании ровно один склад, выбирается автоматически — тот же
  // принцип, что listActiveByCompany у цехов (contract-manufacturing).
  listByCompany(companyId: string): Promise<Warehouse[]>;
}

export interface StockMovementMeta {
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
}

// Репозиторий сам не проверяет бизнес-инварианты (достаточно ли остатка и
// т.п.) — это делает use case, читая findStockItem() заранее. Репозиторий
// отвечает только за атомарность записи (движение + денормализованный
// остаток в одной транзакции).
export interface StockRepository {
  findStockItem(warehouseId: string, productVariantId: string): Promise<StockItem | null>;
  receive(warehouseId: string, productVariantId: string, quantity: number, meta: StockMovementMeta): Promise<StockItem>;
  dispatch(warehouseId: string, productVariantId: string, quantity: number, meta: StockMovementMeta): Promise<StockItem>;
  transfer(
    originWarehouseId: string,
    destinationWarehouseId: string,
    productVariantId: string,
    quantity: number,
    meta: StockMovementMeta,
  ): Promise<{ origin: StockItem; destination: StockItem }>;
  reserve(warehouseId: string, productVariantId: string, quantity: number): Promise<StockItem>;
  release(warehouseId: string, productVariantId: string, quantity: number): Promise<StockItem>;
  adjust(
    warehouseId: string,
    productVariantId: string,
    actualQuantity: number,
    createdBy: string | null,
  ): Promise<{ stockItem: StockItem; discrepancy: number }>;
}

export interface MaterialStockMovementMeta {
  referenceType?: string | null;
  referenceId?: string | null;
  createdBy?: string | null;
}

// Материалы не резервируются (в отличие от готовых SKU) — только приёмка
// (из закупки), расход (при подтверждении заказа пошива) и корректировка.
export interface MaterialStockRepository {
  findMaterialStockItem(warehouseId: string, materialId: string): Promise<MaterialStockItem | null>;
  receive(warehouseId: string, materialId: string, quantity: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem>;
  consume(warehouseId: string, materialId: string, quantity: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem>;
}

export interface NewShipmentInput {
  companyId: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  carrierId: string | null;
  trackingNumber: string | null;
  createdBy: string | null;
  items: ShipmentItemDraft[];
}

export interface ShipmentRepository {
  create(input: NewShipmentInput): Promise<Shipment>;
  findById(companyId: string, id: string): Promise<Shipment | null>;
  updateStatus(id: string, status: ShipmentStatus, deliveredAt: Date | null): Promise<Shipment>;
}

export interface InventoryCountRepository {
  create(warehouseId: string, performedBy: string | null): Promise<InventoryCount>;
  findById(id: string): Promise<InventoryCount | null>;
  addItem(
    inventoryCountId: string,
    productVariantId: string,
    expectedQuantity: number,
    actualQuantity: number,
    discrepancy: number,
  ): Promise<InventoryCount>;
  updateStatus(id: string, status: InventoryCountStatus, performedAt: Date | null): Promise<InventoryCount>;
}
