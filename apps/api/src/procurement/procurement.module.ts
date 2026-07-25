import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  DrizzleMaterialRepository,
  DrizzlePurchaseOrderRepository,
  DrizzleSupplierRepository,
} from "@garmentos/domain-procurement";
import { DATABASE_CONNECTION } from "../database/database.module";
import { MaterialsController } from "./materials.controller";
import { SuppliersController } from "./suppliers.controller";
import { PurchaseOrdersController } from "./purchase-orders.controller";
import { MATERIAL_REPOSITORY, PURCHASE_ORDER_REPOSITORY, SUPPLIER_REPOSITORY } from "./procurement.tokens";
import { ProcurementService } from "./procurement.service";

@Module({
  controllers: [MaterialsController, SuppliersController, PurchaseOrdersController],
  providers: [
    ProcurementService,
    {
      provide: MATERIAL_REPOSITORY,
      useFactory: (db: Database) => new DrizzleMaterialRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: SUPPLIER_REPOSITORY,
      useFactory: (db: Database) => new DrizzleSupplierRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: PURCHASE_ORDER_REPOSITORY,
      useFactory: (db: Database) => new DrizzlePurchaseOrderRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class ProcurementModule {}
