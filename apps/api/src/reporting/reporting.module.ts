import { Module } from "@nestjs/common";
import { BomModule } from "../bom/bom.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DocumentModule } from "../document/document.module";
import { AttentionController } from "./attention.controller";
import { AttentionService } from "./attention.service";
import { BatchPassportController } from "./batch-passport.controller";
import { BatchPassportService } from "./batch-passport.service";
import { CostingController } from "./costing.controller";
import { CostingService } from "./costing.service";

// Reporting/BI (docs/ARCHITECTURE.md) — агрегированная аналитика поверх
// остальных модулей, только чтение. Экраны: «Внимание сегодня»
// (attention.service.ts), «Расчёт стоимости спецификации» (costing.service.ts),
// «Паспорт партии» (batch-passport.service.ts, owner 2026-08-03).
@Module({
  imports: [CatalogModule, BomModule, ContractManufacturingModule, DocumentModule],
  controllers: [AttentionController, CostingController, BatchPassportController],
  providers: [AttentionService, CostingService, BatchPassportService],
  // CostingService нужен ProductionOrderOrchestrationService для фиксации
  // Snapshot партии при подтверждении заказа (owner, 2026-08-03 — «Паспорт
  // партии», docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md).
  exports: [CostingService],
})
export class ReportingModule {}
