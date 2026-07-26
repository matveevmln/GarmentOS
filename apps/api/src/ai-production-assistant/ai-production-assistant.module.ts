import { Module } from "@nestjs/common";
import { AnthropicAIClassifier, RuleBasedAIClassifier } from "./ai-classifier";
import { AI_CLASSIFIER } from "./ai-production-assistant.tokens";
import { ProductionRequestController } from "./production-request.controller";
import { ProductionRequestService } from "./production-request.service";

// Тот же паттерн DI-фабрики, что TelegramModule (telegram.module.ts) —
// без ANTHROPIC_API_KEY используется детерминированный fallback вместо
// фиктивного/захардкоженного ключа.
@Module({
  controllers: [ProductionRequestController],
  providers: [
    ProductionRequestService,
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
