import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleProductionOrderRepository, DrizzleWorkshopRepository } from "@garmentos/domain-contract-manufacturing";
import { DATABASE_CONNECTION } from "../database/database.module";
import { WorkshopsController } from "./workshops.controller";
import { ProductionOrdersController } from "./production-orders.controller";
import { PRODUCTION_ORDER_REPOSITORY, WORKSHOP_REPOSITORY } from "./contract-manufacturing.tokens";
import { bomApprovalProvider } from "./bom-approval.provider";
import { ContractManufacturingService } from "./contract-manufacturing.service";

@Module({
  controllers: [WorkshopsController, ProductionOrdersController],
  providers: [
    ContractManufacturingService,
    bomApprovalProvider,
    {
      provide: WORKSHOP_REPOSITORY,
      useFactory: (db: Database) => new DrizzleWorkshopRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: PRODUCTION_ORDER_REPOSITORY,
      useFactory: (db: Database) => new DrizzleProductionOrderRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
  // WORKSHOP_REPOSITORY нужен apps/api/src/telegram (привязка чата цеха к
  // Telegram, docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md) — тот же провайдер,
  // не отдельный экземпляр репозитория. ContractManufacturingService нужен
  // ai-production-assistant (создание заказа из разобранного запроса + показ
  // заказа, Итерация 7) — переиспользуется, не дублируется.
  exports: [WORKSHOP_REPOSITORY, ContractManufacturingService],
})
export class ContractManufacturingModule {}
