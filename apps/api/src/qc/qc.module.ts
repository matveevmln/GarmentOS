import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleQcResultRepository } from "@garmentos/domain-qc";
import { AuditModule } from "../audit/audit.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DATABASE_CONNECTION } from "../database/database.module";
import { QcController } from "./qc.controller";
import { QcService } from "./qc.service";
import { QC_PRODUCTION_ORDER_PORT, QC_RESULT_REPOSITORY } from "./qc.tokens";
import { QcProductionOrderLookupAdapter } from "./production-order-lookup.adapter";

// ОТК читает заказ только через порт (docs/PRINCIPLES.md, принцип 2) — модуль
// подключает существующий сервис как адаптер, не заводит собственный доступ
// к таблице production_orders.
@Module({
  imports: [ContractManufacturingModule, AuditModule],
  controllers: [QcController],
  providers: [
    QcService,
    QcProductionOrderLookupAdapter,
    {
      provide: QC_RESULT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleQcResultRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    { provide: QC_PRODUCTION_ORDER_PORT, useExisting: QcProductionOrderLookupAdapter },
  ],
  exports: [QcService],
})
export class QcModule {}
