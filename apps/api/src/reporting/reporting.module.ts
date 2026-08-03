import { Module } from "@nestjs/common";
import { BomModule } from "../bom/bom.module";
import { CatalogModule } from "../catalog/catalog.module";
import { AttentionController } from "./attention.controller";
import { AttentionService } from "./attention.service";
import { CostingController } from "./costing.controller";
import { CostingService } from "./costing.service";

// Reporting/BI (docs/ARCHITECTURE.md) — агрегированная аналитика поверх
// остальных модулей, только чтение. Экраны: «Внимание сегодня»
// (attention.service.ts), «Расчёт стоимости спецификации» (costing.service.ts).
@Module({
  imports: [CatalogModule, BomModule],
  controllers: [AttentionController, CostingController],
  providers: [AttentionService, CostingService],
})
export class ReportingModule {}
