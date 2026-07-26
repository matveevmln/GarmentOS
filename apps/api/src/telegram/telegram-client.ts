import { Logger } from "@nestjs/common";

// Исходящий Telegram-клиент за интерфейсом (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md,
// раздел 3) — тем же паттерном, что MarketplaceConnector/StorageAdapter:
// конкретная реализация (реальный Bot API или лог для окружений без
// настоящего токена) не зашита в вызывающий код.
export interface TelegramClient {
  sendMessage(chatId: string, text: string): Promise<void>;
  sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<void>;
}

// Используется, пока TELEGRAM_BOT_TOKEN не настроен в окружении (решение
// владельца проекта 2026-07-26 — собрать весь код заранее, реальный токен
// подключить позже без изменения вызывающего кода). Пишет в лог вместо
// реального вызова Bot API — виден весь путь сценария end-to-end даже без
// настоящего бота.
export class LoggingTelegramClient implements TelegramClient {
  private readonly logger = new Logger(LoggingTelegramClient.name);

  sendMessage(chatId: string, text: string): Promise<void> {
    this.logger.log(`[TELEGRAM STUB] → chat ${chatId}: ${text}`);
    return Promise.resolve();
  }

  sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<void> {
    this.logger.log(`[TELEGRAM STUB] → chat ${chatId}: документ ${fileUrl}${caption ? ` (${caption})` : ""}`);
    return Promise.resolve();
  }
}

// Реальный Bot API поверх fetch — готов к использованию, как только
// TELEGRAM_BOT_TOKEN появится в окружении (см. telegram.module.ts).
export class HttpTelegramClient implements TelegramClient {
  constructor(private readonly botToken: string) {}

  private get baseUrl(): string {
    return `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.call("sendMessage", { chat_id: chatId, text });
  }

  async sendDocument(chatId: string, fileUrl: string, caption?: string): Promise<void> {
    await this.call("sendDocument", { chat_id: chatId, document: fileUrl, caption });
  }

  private async call(method: string, body: Record<string, unknown>): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Telegram Bot API ${method} вернул ${response.status}: ${detail}`);
    }
  }
}
