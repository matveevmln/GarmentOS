import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleDefectCompensationRepository, DrizzleProductionOrderDefectRepository } from "@garmentos/domain-defect";
import { AuditModule } from "../audit/audit.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DATABASE_CONNECTION } from "../database/database.module";
import { DefectCompensationController, DefectController, DefectSummaryController } from "./defect.controller";
import { DefectService } from "./defect.service";
import { DEFECT_COMPENSATION_REPOSITORY, DEFECT_PRODUCTION_ORDER_PORT, DEFECT_REPOSITORY } from "./defect.tokens";
import { DefectProductionOrderLookupAdapter } from "./production-order-lookup.adapter";

// Брак/компенсация читают заказ только через порт (docs/PRINCIPLES.md,
// принцип 2) — модуль подключает существующий сервис как адаптер, не
// заводит собственный доступ к таблице production_orders. Экспортирует
// DefectService — QcModule вызывает его после записи результата ОТК.
@Module({
  imports: [ContractManufacturingModule, AuditModule],
  controllers: [DefectController, DefectSummaryController, DefectCompensationController],
  providers: [
    DefectService,
    DefectProductionOrderLookupAdapter,
    {
      provide: DEFECT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleProductionOrderDefectRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: DEFECT_COMPENSATION_REPOSITORY,
      useFactory: (db: Database) => new DrizzleDefectCompensationRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    { provide: DEFECT_PRODUCTION_ORDER_PORT, useExisting: DefectProductionOrderLookupAdapter },
  ],
  exports: [DefectService],
})
export class DefectModule {}
