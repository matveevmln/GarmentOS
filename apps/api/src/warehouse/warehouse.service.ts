import { Inject, Injectable } from "@nestjs/common";
import {
  completeInventoryCount,
  adjustMaterialStock as adjustMaterialStockUseCase,
  consumeMaterialStock as consumeMaterialStockUseCase,
  createInventoryCount,
  createShipment,
  createWarehouse,
  dispatchShipment,
  dispatchStock,
  markShipmentDelivered,
  receiveMaterialStock as receiveMaterialStockUseCase,
  receiveStock,
  recordInventoryCountItem,
  releaseReservation,
  reserveStock,
  transferStock,
  type InventoryCount,
  type InventoryCountRepository,
  type MaterialStockItem,
  type MaterialStockMovementMeta,
  type MaterialStockRepository,
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
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import {
  INVENTORY_COUNT_REPOSITORY,
  MATERIAL_STOCK_REPOSITORY,
  SHIPMENT_REPOSITORY,
  STOCK_REPOSITORY,
  WAREHOUSE_REPOSITORY,
} from "./warehouse.tokens";

function stockSnapshot(item: StockItem | null): unknown {
  return item ? { quantityOnHand: item.quantityOnHand, quantityReserved: item.quantityReserved } : null;
}

function materialStockSnapshot(item: MaterialStockItem | null): unknown {
  return item ? { quantityOnHand: item.quantityOnHand } : null;
}

// Тонкий presentation-адаптер поверх packages/domain/warehouse
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в остальных модулях.
//
// Аудит (docs/ARCHITECTURE.md, раздел 7; Итерация 6): receive/dispatch/transfer
// — единственные операции, реально меняющие остаток (в отличие от
// reserve/release, которые лишь резервируют уже существующее количество) —
// пишут before/after в audit_log. Резервирование и инвентаризация сознательно
// не покрыты этой итерацией — расширение до полного покрытия складских
// операций, не архитектурное решение.
@Injectable()
export class WarehouseService {
  constructor(
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouses: WarehouseRepository,
    @Inject(STOCK_REPOSITORY) private readonly stock: StockRepository,
    @Inject(MATERIAL_STOCK_REPOSITORY) private readonly materialStock: MaterialStockRepository,
    @Inject(SHIPMENT_REPOSITORY) private readonly shipments: ShipmentRepository,
    @Inject(INVENTORY_COUNT_REPOSITORY) private readonly inventoryCounts: InventoryCountRepository,
    private readonly auditService: AuditService,
  ) {}

  async createWarehouse(companyId: string, input: CreateWarehouseDto): Promise<Warehouse> {
    return createWarehouse({ warehouses: this.warehouses }, { ...input, companyId });
  }

  // Авторезолв единственного склада компании (Итерация 9, владелец проекта
  // 2026-08-02) — тот же принцип, что listActiveByCompany у цехов.
  async listWarehouses(companyId: string): Promise<Warehouse[]> {
    return this.warehouses.listByCompany(companyId);
  }

  async findMaterialStockItem(warehouseId: string, materialId: string): Promise<MaterialStockItem | null> {
    return this.materialStock.findMaterialStockItem(warehouseId, materialId);
  }

  async receiveMaterialStock(
    currentUser: AuthenticatedRequestUser,
    warehouseId: string,
    materialId: string,
    quantity: number,
    meta: MaterialStockMovementMeta = {},
  ): Promise<MaterialStockItem> {
    const before = await this.materialStock.findMaterialStockItem(warehouseId, materialId);
    const item = await receiveMaterialStockUseCase(
      { materialStock: this.materialStock },
      { warehouseId, materialId, quantity, meta: { ...meta, createdBy: currentUser.id } },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "material_stock_item",
      entityId: item.id,
      action: "warehouse.material_stock_receive",
      beforeJson: materialStockSnapshot(before),
      afterJson: materialStockSnapshot(item),
    });
    return item;
  }

  // Расход материала при подтверждении заказа пошива — вызывается из
  // ProductionOrderOrchestrationService (Telegram — тонкий интерфейс, эта
  // операция не имеет отдельного HTTP-эндпоинта и аутентифицированного
  // currentUser, тот же принцип, что и обновление статуса заказа от цеха).
  // allowOverdraft — для факта раскроя (владелец проекта, 2026-08-30): крой
  // уже произошёл физически, и запрет его записать хуже, чем расхождение с
  // учётом. По умолчанию выключено, поэтому приёмка закупки и прочие
  // вызывающие сохраняют строгую проверку остатка.
  async consumeMaterialStock(
    warehouseId: string,
    materialId: string,
    quantity: number,
    meta: MaterialStockMovementMeta = {},
    allowOverdraft = false,
  ): Promise<MaterialStockItem> {
    return consumeMaterialStockUseCase(
      { materialStock: this.materialStock },
      { warehouseId, materialId, quantity, meta, allowOverdraft },
    );
  }

  // Корректировка остатка на разницу — исправление ранее внесённого факта
  // кроя. Прежнее движение не переписывается, добавляется отдельное типа
  // adjustment (владелец проекта, 2026-08-30).
  async adjustMaterialStock(
    warehouseId: string,
    materialId: string,
    delta: number,
    meta: MaterialStockMovementMeta = {},
  ): Promise<MaterialStockItem> {
    return adjustMaterialStockUseCase({ materialStock: this.materialStock }, { warehouseId, materialId, delta, meta });
  }

  async receiveStock(currentUser: AuthenticatedRequestUser, input: ReceiveStockDto): Promise<StockItem> {
    const before = await this.stock.findStockItem(input.warehouseId, input.productVariantId);
    const stockItem = await receiveStock(
      { stock: this.stock },
      {
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: input.createdBy },
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "stock_item",
      entityId: stockItem.id,
      action: "warehouse.stock_receive",
      beforeJson: stockSnapshot(before),
      afterJson: stockSnapshot(stockItem),
    });
    return stockItem;
  }

  async dispatchStock(currentUser: AuthenticatedRequestUser, input: DispatchStockDto): Promise<StockItem> {
    const before = await this.stock.findStockItem(input.warehouseId, input.productVariantId);
    const stockItem = await dispatchStock(
      { stock: this.stock },
      {
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: input.createdBy },
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "stock_item",
      entityId: stockItem.id,
      action: "warehouse.stock_dispatch",
      beforeJson: stockSnapshot(before),
      afterJson: stockSnapshot(stockItem),
    });
    return stockItem;
  }

  async transferStock(
    currentUser: AuthenticatedRequestUser,
    input: TransferStockDto,
  ): Promise<{ origin: StockItem; destination: StockItem }> {
    const beforeOrigin = await this.stock.findStockItem(input.originWarehouseId, input.productVariantId);
    const beforeDestination = await this.stock.findStockItem(input.destinationWarehouseId, input.productVariantId);
    const result = await transferStock(
      { stock: this.stock },
      {
        originWarehouseId: input.originWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: input.createdBy },
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "stock_item",
      entityId: result.origin.id,
      action: "warehouse.stock_transfer_origin",
      beforeJson: stockSnapshot(beforeOrigin),
      afterJson: stockSnapshot(result.origin),
    });
    await this.auditService.recordForUser(currentUser, {
      entityType: "stock_item",
      entityId: result.destination.id,
      action: "warehouse.stock_transfer_destination",
      beforeJson: stockSnapshot(beforeDestination),
      afterJson: stockSnapshot(result.destination),
    });
    return result;
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
