import { Inject, Injectable, NotFoundException } from "@nestjs/common";
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
  type ProductVariantOwnershipPort,
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
import { CatalogService } from "../catalog/catalog.service";
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
    private readonly catalogService: CatalogService,
  ) {}

  // Реализация ACL-порта domain-warehouse (SEC-P1, владелец проекта,
  // 2026-09-24) — SKU принадлежит catalog, не warehouse; domain-warehouse не
  // зависит от domain-catalog в рантайме (только devDependency для тестов),
  // поэтому проверка идёт через CatalogService, уже композированный в этом
  // модуле (см. warehouse.module.ts).
  private readonly productVariantOwnership: ProductVariantOwnershipPort = {
    belongsToCompany: async (companyId, productVariantId) =>
      (await this.catalogService.findProductVariantById(companyId, productVariantId)) !== null,
  };

  // SEC-P1 (владелец проекта, 2026-09-24) — та же проверка, что и в
  // packages/domain/warehouse/src/application/*.ts, вызывается здесь ДО
  // чтения before-снимка для аудита: без неё receiveStock/dispatchStock/
  // transferStock читали фактический остаток чужого склада во временную
  // переменную ещё до того, как доменный слой успевал отклонить операцию
  // (снимок никуда не публиковался, но и такого чтения быть не должно).
  // Домен всё равно проверяет то же самое — это дополнительный барьер, а не
  // замена ему.
  private async assertOwnWarehouseAndVariant(
    companyId: string,
    warehouseId: string,
    productVariantId: string,
  ): Promise<void> {
    const warehouse = await this.warehouses.findById(companyId, warehouseId);
    if (!warehouse) {
      throw new NotFoundException({ statusCode: 404, code: "WAREHOUSE_NOT_FOUND", message: `Склад ${warehouseId} не найден` });
    }
    const belongs = await this.productVariantOwnership.belongsToCompany(companyId, productVariantId);
    if (!belongs) {
      throw new NotFoundException({ statusCode: 404, code: "PRODUCT_VARIANT_NOT_FOUND", message: `SKU ${productVariantId} не найден` });
    }
  }

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

  // Остаток материалов по складу (P0-3, владелец проекта, 2026-09-07) —
  // "видимость остатков материалов": до этого метода в системе не было ни
  // одного способа узнать текущий остаток, кроме прямого запроса к БД.
  // Источник истины — уже существующая material_stock_items, обновляемая
  // на каждое движение; новой таблицы/агрегата это не заводит.
  async listMaterialStock(companyId: string, warehouseId: string): Promise<MaterialStockItem[]> {
    const warehouse = await this.warehouses.findById(companyId, warehouseId);
    if (!warehouse) {
      throw new NotFoundException({ statusCode: 404, code: "WAREHOUSE_NOT_FOUND", message: `Склад ${warehouseId} не найден` });
    }
    return this.materialStock.listByWarehouse(warehouseId);
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

  // Приход материала без аудит-контекста пользователя (Этап 3, владелец
  // проекта, 2026-09-12) — тот же принцип, что и consumeMaterialStock ниже:
  // вызывается из доменных сценариев (возврат материала после кроя), не
  // напрямую по HTTP, поэтому нет AuthenticatedRequestUser для аудита —
  // вызывающий код (CuttingService) сам пишет одну аудит-запись на всю
  // операцию внесения факта, включая возврат.
  async receiveMaterialStockInternal(
    warehouseId: string,
    materialId: string,
    quantity: number,
    meta: MaterialStockMovementMeta = {},
  ): Promise<MaterialStockItem> {
    return receiveMaterialStockUseCase({ materialStock: this.materialStock }, { warehouseId, materialId, quantity, meta });
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
    await this.assertOwnWarehouseAndVariant(currentUser.companyId, input.warehouseId, input.productVariantId);
    const before = await this.stock.findStockItem(input.warehouseId, input.productVariantId);
    const stockItem = await receiveStock(
      { stock: this.stock, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      {
        companyId: currentUser.companyId,
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        // createdBy — из доверенного контекста авторизации, не из тела
        // запроса (SEC-P1, владелец проекта, 2026-09-24): раньше
        // input.createdBy позволял записать движение от имени чужого
        // пользователя.
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: currentUser.id },
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
    await this.assertOwnWarehouseAndVariant(currentUser.companyId, input.warehouseId, input.productVariantId);
    const before = await this.stock.findStockItem(input.warehouseId, input.productVariantId);
    const stockItem = await dispatchStock(
      { stock: this.stock, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      {
        companyId: currentUser.companyId,
        warehouseId: input.warehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: currentUser.id },
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
    await this.assertOwnWarehouseAndVariant(currentUser.companyId, input.originWarehouseId, input.productVariantId);
    await this.assertOwnWarehouseAndVariant(currentUser.companyId, input.destinationWarehouseId, input.productVariantId);
    const beforeOrigin = await this.stock.findStockItem(input.originWarehouseId, input.productVariantId);
    const beforeDestination = await this.stock.findStockItem(input.destinationWarehouseId, input.productVariantId);
    const result = await transferStock(
      { stock: this.stock, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      {
        companyId: currentUser.companyId,
        originWarehouseId: input.originWarehouseId,
        destinationWarehouseId: input.destinationWarehouseId,
        productVariantId: input.productVariantId,
        quantity: input.quantity,
        meta: { referenceType: input.referenceType, referenceId: input.referenceId, createdBy: currentUser.id },
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

  // companyId — из доверенного контекста авторизации (SEC-P1, владелец
  // проекта, 2026-09-24): раньше эти два метода не принимали companyId
  // вовсе, а контроллер вызывал их даже без @CurrentUser() — резерв/снятие
  // резерва на чужом складе не отклонялись никак.
  async reserveStock(companyId: string, input: StockReservationDto): Promise<StockItem> {
    return reserveStock(
      { stock: this.stock, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      { ...input, companyId },
    );
  }

  async releaseReservation(companyId: string, input: StockReservationDto): Promise<StockItem> {
    return releaseReservation(
      { stock: this.stock, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      { ...input, companyId },
    );
  }

  // currentUser, не просто companyId (SEC-P1, владелец проекта, 2026-09-24):
  // createdBy берётся из доверенного контекста, а не из input.createdBy —
  // раньше тело запроса могло подставить чужого пользователя автором
  // отгрузки. companyId, origin/destination и SKU каждой строки проверяет
  // домен (createShipment) до записи.
  async createShipment(currentUser: AuthenticatedRequestUser, input: CreateShipmentDto): Promise<Shipment> {
    return createShipment(
      { shipments: this.shipments, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      { ...input, companyId: currentUser.companyId, createdBy: currentUser.id },
    );
  }

  async dispatchShipment(companyId: string, shipmentId: string): Promise<Shipment> {
    return dispatchShipment(
      { shipments: this.shipments, stock: this.stock, warehouses: this.warehouses, productVariants: this.productVariantOwnership },
      { companyId, shipmentId },
    );
  }

  async markShipmentDelivered(companyId: string, shipmentId: string): Promise<Shipment> {
    return markShipmentDelivered({ shipments: this.shipments, warehouses: this.warehouses }, { companyId, shipmentId });
  }

  // companyId во всех трёх методах — из аутентифицированного контекста
  // (@CurrentUser), не из тела/URL: инвентаризация принадлежит компании
  // через свой склад (Step 4A.2).
  async createInventoryCount(companyId: string, input: CreateInventoryCountDto): Promise<InventoryCount> {
    return createInventoryCount(
      { inventoryCounts: this.inventoryCounts, warehouses: this.warehouses },
      { ...input, companyId },
    );
  }

  async recordInventoryCountItem(
    currentUser: AuthenticatedRequestUser,
    inventoryCountId: string,
    input: RecordInventoryCountItemDto,
  ): Promise<InventoryCount> {
    return recordInventoryCountItem(
      { inventoryCounts: this.inventoryCounts, stock: this.stock, productVariants: this.productVariantOwnership },
      {
        companyId: currentUser.companyId,
        inventoryCountId,
        productVariantId: input.productVariantId,
        actualQuantity: input.actualQuantity,
        // createdBy — из доверенного контекста, не из тела запроса (SEC-P1,
        // владелец проекта, 2026-09-24), тот же принцип, что и в receiveStock.
        createdBy: currentUser.id,
      },
    );
  }

  async completeInventoryCount(companyId: string, inventoryCountId: string): Promise<InventoryCount> {
    return completeInventoryCount({ inventoryCounts: this.inventoryCounts }, { companyId, inventoryCountId });
  }
}
