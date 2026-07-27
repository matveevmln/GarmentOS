import { Module } from "@nestjs/common";
import { HttpTelegramClient, LoggingTelegramClient, type TelegramClient } from "./telegram-client";
import { TELEGRAM_CLIENT } from "./telegram.tokens";

// Вынесен из TelegramModule в отдельный модуль без зависимостей — нужен
// ai-production-assistant (отправка PDF цеху) И TelegramModule (ответы
// пользователю), а TelegramModule, в свою очередь, импортирует
// AiProductionAssistantModule (для сценария "текст → подтверждение →
// заказ", Итерация 7) — без этого разделения возник бы цикл модулей
// (TelegramModule → AiProductionAssistantModule → TelegramModule).
@Module({
  providers: [
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
  exports: [TELEGRAM_CLIENT],
})
export class TelegramClientModule {}
