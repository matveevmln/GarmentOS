import { Inject, Injectable } from "@nestjs/common";
import {
  completeInventoryCount,
  createInventoryCount,
  createShipment,
  createWarehouse,
  dispatchShipment,
  dispatchStock,
  markShipmentDelivered,
  receiveStock,
  recordInventoryCountItem,
  releaseReservation,
  reserveStock,
  transferStock,
  type InventoryCount,
  type InventoryCountRepository,
  type Shipment,
  type ShipmentRepository,
  type StockItem,
  type StockRepository,
  type Warehouse,
  type WarehouseRepository,
} from "@garmentos/domain-warehouse";
import type {
  CreateInventoryCountDto,
  CreateShipmentDto,
  CreateWarehouseDto,
  DispatchStockDto,
  ReceiveStockDto,
  RecordInventoryCountItemDto,
  StockReservationDto,
  TransferStockDto,
} from "@garmentos/shared-types";
import {
  INVENTORY_COUNT_REPOSITORY,
  SHIPMENT_REPOSITORY,
  STOCK_REPOSITORY,
  WAREHOUSE_REPOSITORY,
} from "./warehouse.tokens";

// Тонкий presentation-адаптер поверх packages/domain/warehouse
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в остальных модулях.
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouses: WarehouseRepository,
    @Inject(STOCK_REPOSITORY) private readonly stock: StockRepository,
    @Inject(SHIPMENT_REPOSITORY) private readonly shipments: ShipmentRepository,
    @Inject(INVENTORY_COUNT_REPOSITORY) private readonly inventoryCounts: InventoryCountRepository,
  ) {}

  async createWarehouse(companyId: string, input: CreateWarehouseDto): Promise<Warehouse> {
    return createWarehouse({ warehouses: this.warehouses }, { ...input, companyId });
  }

  async receiveStock(input: ReceiveStockDto): Promise<StockItem> {
    return receiveStock(
      { stock: this.stock },
      {
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: input.createdBy },
      },
    );
  }

  async dispatchStock(input: DispatchStockDto): Promise<StockItem> {
    return dispatchStock(
      { stock: this.stock },
      {
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: input.createdBy },
      },
    );
  }

  async transferStock(input: TransferStockDto): Promise<{ origin: StockItem; destination: StockItem }> {
    return transferStock(
      { stock: this.stock },
      {
        originWarehouseId: input.originWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: input.createdBy },
      },
    );
  }

  async reserveStock(input: StockReservationDto): Promise<StockItem> {
    return reserveStock({ stock: this.stock }, input);
  }

  async releaseReservation(input: StockReservationDto): Promise<StockItem> {
    return releaseReservation({ stock: this.stock }, input);
  }

  async createShipment(companyId: string, input: CreateShipmentDto): Promise<Shipment> {
    return createShipment({ shipments: this.shipments }, { ...input, companyId });
  }

  async dispatchShipment(companyId: string, shipmentId: string): Promise<Shipment> {
    return dispatchShipment({ shipments: this.shipments, stock: this.stock }, { companyId, shipmentId });
  }

  async markShipmentDelivered(companyId: string, shipmentId: string): Promise<Shipment> {
    return markShipmentDelivered({ shipments: this.shipments }, { companyId, shipmentId });
  }

  async createInventoryCount(input: CreateInventoryCountDto): Promise<InventoryCount> {
    return createInventoryCount({ inventoryCounts: this.inventoryCounts }, input);
  }

  async recordInventoryCountItem(
    inventoryCountId: string,
    input: RecordInventoryCountItemDto,
  ): Promise<InventoryCount> {
    return recordInventoryCountItem(
      { inventoryCounts: this.inventoryCounts, stock: this.stock },
      { inventoryCountId, productVariantId: input.productVariantId, actualQuantity: input.actualQuantity, createdBy: input.createdBy },
    );
  }

  async completeInventoryCount(inventoryCountId: string): Promise<InventoryCount> {
    return completeInventoryCount({ inventoryCounts: this.inventoryCounts }, { inventoryCountId });
  }
}
