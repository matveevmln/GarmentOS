import { Module } from "@nestjs/common";
import { BomModule } from "../bom/bom.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DocumentModule } from "../document/document.module";
import { IdentityModule } from "../identity/identity.module";
import { TelegramClientModule } from "../telegram/telegram-client.module";
import { AnthropicAIClassifier, RuleBasedAIClassifier } from "./ai-classifier";
import { AI_CLASSIFIER } from "./ai-production-assistant.tokens";
import { ProductionOrderOrchestrationService } from "./production-order-orchestration.service";
import { ProductionOrderSpecificationController } from "./production-order-specification.controller";
import { ProductionRequestController } from "./production-request.controller";
import { ProductionRequestService } from "./production-request.service";

// Тот же паттерн DI-фабрики, что TelegramClientModule — без ANTHROPIC_API_KEY
// используется детерминированный fallback вместо фиктивного/захардкоженного
// ключа. Модуль импортирует Catalog/BOM/ContractManufacturing/Document/
// Identity не потому что это его домен, а потому что оркестрация
// вертикального сценария (Итерация 7) вызывает их уже существующие
// application-сервисы — сама оркестрация не содержит доменной логики.
// Импортирует только TelegramClientModule (не полный TelegramModule) —
// TelegramModule сам импортирует этот модуль для сценария "текст →
// подтверждение → заказ" (Telegram — тонкий интерфейс над этой
// оркестрацией, не наоборот), обратный импорт создал бы цикл.
@Module({
  imports: [CatalogModule, BomModule, ContractManufacturingModule, DocumentModule, TelegramClientModule, IdentityModule],
  controllers: [ProductionRequestController, ProductionOrderSpecificationController],
  providers: [
    ProductionRequestService,
    ProductionOrderOrchestrationService,
    {
      provide: AI_CLASSIFIER,
      useFactory: () => {
        const apiKey = process.env.ANTHROPIC_API_KEY;
        return apiKey ? new AnthropicAIClassifier(apiKey) : new RuleBasedAIClassifier();
      },
    },
  ],
  // ProductionOrderOrchestrationService нужен TelegramModule (сценарий
  // "текст → подтверждение → заказ") — переиспользуется, не дублируется.
  exports: [ProductionOrderOrchestrationService],
})
export class AiProductionAssistantModule {}
