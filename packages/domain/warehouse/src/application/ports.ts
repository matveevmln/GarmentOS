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
// (из закупки), расход (по факту раскроя) и корректировка (исправление
// ранее внесённого факта).
export interface MaterialStockRepository {
  findMaterialStockItem(warehouseId: string, materialId: string): Promise<MaterialStockItem | null>;
  // Остаток по складу (P0-3, владелец проекта, 2026-09-07) — "видимость
  // остатков материалов". Источник истины — эта же денормализованная
  // таблица (material_stock_items), обновляемая на каждое движение; новой
  // таблицы/агрегата не заводим.
  listByWarehouse(warehouseId: string): Promise<MaterialStockItem[]>;
  receive(warehouseId: string, materialId: string, quantity: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem>;
  consume(warehouseId: string, materialId: string, quantity: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem>;
  // Корректировка на разницу: прошлое движение не переписывается, добавляется
  // отдельная строка типа adjustment (владелец проекта, 2026-08-30).
  adjust(warehouseId: string, materialId: string, delta: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem>;
}

// SKU (product_variant) принадлежит чужому bounded context (catalog);
// domain-warehouse сознательно не имеет рантайм-зависимости от domain-catalog
// (см. package.json — только devDependency для тестов, тот же принцип
// независимости доменных пакетов, что и в остальных модулях,
// docs/ARCHITECTURE.md «Правило межмодульного взаимодействия»). Проверка
// принадлежности SKU компании поэтому идёт через ACL-порт, который apps/api
// реализует поверх настоящего ProductVariantRepository/CatalogService
// (SEC-P1, владелец проекта, 2026-09-24 — до этого порта productVariantId
// из тела запроса не проверялся на принадлежность компании нигде).
export interface ProductVariantOwnershipPort {
  belongsToCompany(companyId: string, productVariantId: string): Promise<boolean>;
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

// У inventory_counts нет своей колонки company_id — принадлежность компании
// выражена через warehouses.company_id. companyId в findById обязателен и
// применяется join'ом к warehouses: без него инвентаризацию чужой компании
// можно было дополнить и завершить, зная только её UUID (Step 4A.2).
export interface InventoryCountRepository {
  create(warehouseId: string, performedBy: string | null): Promise<InventoryCount>;
  findById(companyId: string, id: string): Promise<InventoryCount | null>;
  addItem(
    inventoryCountId: string,
    productVariantId: string,
    expectedQuantity: number,
    actualQuantity: number,
    discrepancy: number,
  ): Promise<InventoryCount>;
  updateStatus(id: string, status: InventoryCountStatus, performedAt: Date | null): Promise<InventoryCount>;
}
