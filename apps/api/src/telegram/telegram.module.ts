import { Module } from "@nestjs/common";
import { ContractManufacturingModule } from "../contract-manufacturing/contract-manufacturing.module";
import { TelegramInviteCodeRepository } from "./telegram-invite-code.repository";
import { HttpTelegramClient, LoggingTelegramClient, type TelegramClient } from "./telegram-client";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";
import { TELEGRAM_CLIENT } from "./telegram.tokens";

@Module({
  imports: [ContractManufacturingModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramInviteCodeRepository,
    {
      provide: TELEGRAM_CLIENT,
      // TELEGRAM_BOT_TOKEN пока не настроен ни в одном окружении (решение
      // владельца проекта 2026-07-26 — собрать код заранее, подключить
      // реальный токен позже без изменения вызывающего кода) — до этого
      // момента исходящие сообщения только логируются.
      useFactory: (): TelegramClient => {
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        return botToken ? new HttpTelegramClient(botToken) : new LoggingTelegramClient();
      },
    },
  ],
  // TELEGRAM_CLIENT нужен ai-production-assistant (отправка сгенерированной
  // спецификации цеху, Итерация 7) — тот же провайдер, не отдельный экземпляр.
  exports: [TELEGRAM_CLIENT],
})
export class TelegramModule {}
