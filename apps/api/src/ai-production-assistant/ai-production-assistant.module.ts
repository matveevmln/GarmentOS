import { Module } from "@nestjs/common";
import { BomModule } from "../bom/bom.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { DocumentModule } from "../document/document.module";
import { IdentityModule } from "../identity/identity.module";
import { TelegramModule } from "../telegram/telegram.module";
import { AnthropicAIClassifier, RuleBasedAIClassifier } from "./ai-classifier";
import { AI_CLASSIFIER } from "./ai-production-assistant.tokens";
import { ProductionOrderOrchestrationService } from "./production-order-orchestration.service";
import { ProductionOrderSpecificationController } from "./production-order-specification.controller";
import { ProductionRequestController } from "./production-request.controller";
import { ProductionRequestService } from "./production-request.service";

// Тот же паттерн DI-фабрики, что TelegramModule (telegram.module.ts) —
// без ANTHROPIC_API_KEY используется детерминированный fallback вместо
// фиктивного/захардкоженного ключа. Модуль импортирует Catalog/BOM/
// ContractManufacturing/Document/Telegram/Identity не потому что это его
// домен, а потому что оркестрация вертикального сценария (Итерация 7)
// вызывает их уже существующие application-сервисы — сама оркестрация
// не содержит доменной логики.
@Module({
  imports: [CatalogModule, BomModule, ContractManufacturingModule, DocumentModule, TelegramModule, IdentityModule],
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
})
export class AiProductionAssistantModule {}
