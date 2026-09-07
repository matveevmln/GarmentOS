import { Module } from "@nestjs/common";
import { AiProductionAssistantModule } from "../ai-production-assistant/ai-production-assistant.module";
import { AuditModule } from "../audit/audit.module";
import { DocumentModule } from "../document/document.module";
import { ProcurementModule } from "../procurement/procurement.module";
import { DocumentIntelligenceController } from "./document-intelligence.controller";
import { DocumentIntelligenceService } from "./document-intelligence.service";

// P6 (Document Intelligence, владелец проекта, 2026-09-06). Импортирует
// AiProductionAssistantModule не потому, что это его домен, а чтобы получить
// уже настроенный AI_CLASSIFIER (тот же Anthropic-адаптер, что и разбор
// текстового производственного запроса) — тот же принцип композиции, что и
// у самого AiProductionAssistantModule (импортирует чужие модули ради их
// application-сервисов, не ради доменной логики). Ни новой БД-таблицы, ни
// нового репозитория этот модуль не заводит.
@Module({
  imports: [AiProductionAssistantModule, DocumentModule, ProcurementModule, AuditModule],
  controllers: [DocumentIntelligenceController],
  providers: [DocumentIntelligenceService],
})
export class DocumentIntelligenceModule {}
