import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleCuttingOrderRepository } from "@garmentos/domain-cutting";
import { AuditModule } from "../audit/audit.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DATABASE_CONNECTION } from "../database/database.module";
import { DocumentModule } from "../document/document.module";
import { ProcurementModule } from "../procurement/procurement.module";
import { WarehouseModule } from "../warehouse/warehouse.module";
import { CuttingOrdersController } from "./cutting-orders.controller";
import { CuttingService } from "./cutting.service";
import {
  CUTTING_MATERIAL_STOCK_PORT,
  CUTTING_ORDER_REPOSITORY,
  CUTTING_PRODUCTION_ORDER_PORT,
} from "./cutting.tokens";
import { CuttingMaterialStockAdapter } from "./material-stock.adapter";
import { ProductionOrderSnapshotAdapter } from "./production-order-snapshot.adapter";

// Раскрой читает заказ и склад только через порты (docs/PRINCIPLES.md,
// принцип 2) — модуль подключает существующие сервисы как адаптеры, а не
// заводит собственный доступ к их таблицам.
@Module({
  imports: [ContractManufacturingModule, CatalogModule, ProcurementModule, WarehouseModule, AuditModule, DocumentModule],
  controllers: [CuttingOrdersController],
  providers: [
    CuttingService,
    ProductionOrderSnapshotAdapter,
    CuttingMaterialStockAdapter,
    {
      provide: CUTTING_ORDER_REPOSITORY,
      useFactory: (db: Database) => new DrizzleCuttingOrderRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    { provide: CUTTING_PRODUCTION_ORDER_PORT, useExisting: ProductionOrderSnapshotAdapter },
    { provide: CUTTING_MATERIAL_STOCK_PORT, useExisting: CuttingMaterialStockAdapter },
  ],
  exports: [CuttingService],
})
export class CuttingModule {}
