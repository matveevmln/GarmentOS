import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  DrizzleInventoryCountRepository,
  DrizzleMaterialStockRepository,
  DrizzleShipmentRepository,
  DrizzleStockRepository,
  DrizzleWarehouseRepository,
} from "@garmentos/domain-warehouse";
import { DATABASE_CONNECTION } from "../database/database.module";
import { WarehousesController } from "./warehouses.controller";
import { StockController } from "./stock.controller";
import { ShipmentsController } from "./shipments.controller";
import { InventoryCountsController } from "./inventory-counts.controller";
import {
  INVENTORY_COUNT_REPOSITORY,
  MATERIAL_STOCK_REPOSITORY,
  SHIPMENT_REPOSITORY,
  STOCK_REPOSITORY,
  WAREHOUSE_REPOSITORY,
} from "./warehouse.tokens";
import { WarehouseService } from "./warehouse.service";

@Module({
  controllers: [WarehousesController, StockController, ShipmentsController, InventoryCountsController],
  providers: [
    WarehouseService,
    {
      provide: WAREHOUSE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleWarehouseRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: STOCK_REPOSITORY,
      useFactory: (db: Database) => new DrizzleStockRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: MATERIAL_STOCK_REPOSITORY,
      useFactory: (db: Database) => new DrizzleMaterialStockRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: SHIPMENT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleShipmentRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: INVENTORY_COUNT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleInventoryCountRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
  // WarehouseService нужен ai-production-assistant (проверка наличия
  // материалов в предпросмотре + расход материалов при подтверждении заказа
  // пошива, Итерация 9, владелец проекта 2026-08-02) — переиспользуется, не
  // дублируется.
  exports: [WarehouseService],
})
export class WarehouseModule {}
