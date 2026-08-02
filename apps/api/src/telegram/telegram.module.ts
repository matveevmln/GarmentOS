import { Module } from "@nestjs/common";
import { AiProductionAssistantModule } from "../ai-production-assistant/ai-production-assistant.module";
import { CatalogModule } from "../catalog/catalog.module";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { TelegramInviteCodeRepository } from "./telegram-invite-code.repository";
import { TelegramClientModule } from "./telegram-client.module";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";

// TelegramModule — тонкий транспортный слой (принцип владельца проекта
// 2026-07-26: "Telegram должен быть тонким интерфейсом. Вся логика должна
// жить в GarmentOS"). Импортирует AiProductionAssistantModule для сценария
// "текст → предпросмотр → подтверждение → заказ" — вся бизнес-логика этого
// сценария живёт в ProductionOrderOrchestrationService, TelegramService
// только маршрутизирует входящие сообщения и форматирует ответ.
@Module({
  imports: [ContractManufacturingModule, TelegramClientModule, AiProductionAssistantModule, CatalogModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramInviteCodeRepository],
})
export class TelegramModule {}
