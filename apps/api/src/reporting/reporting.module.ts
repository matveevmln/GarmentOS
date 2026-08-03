import { Module } from "@nestjs/common";
import { AttentionController } from "./attention.controller";
import { AttentionService } from "./attention.service";

// Reporting/BI (docs/ARCHITECTURE.md) — агрегированная аналитика поверх
// остальных модулей, только чтение. Первый экран — «Внимание сегодня»
// (attention.service.ts).
@Module({
  controllers: [AttentionController],
  providers: [AttentionService],
})
export class ReportingModule {}
