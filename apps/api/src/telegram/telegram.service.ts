import { Inject, Injectable, Logger } from "@nestjs/common";
import { inboxChannels, inboxItems, type Database } from "@garmentos/db-schema";
import { linkWorkshopTelegramChat, type WorkshopRepository } from "@garmentos/domain-contract-manufacturing";
import { and, eq } from "drizzle-orm";
import { DATABASE_CONNECTION } from "../database/database.module";
import { WORKSHOP_REPOSITORY } from "../contract-manufacturing/contract-manufacturing.tokens";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { TelegramInviteCodeRepository } from "./telegram-invite-code.repository";
import { TELEGRAM_CLIENT } from "./telegram.tokens";
import type { TelegramClient } from "./telegram-client";
import type { TelegramUpdate } from "./telegram-update.schema";

// Ключевые слова простого текстового ответа цеха → статус заказа
// (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 4, Итерация 7) — не
// NLU, просто самый узкий набор, достаточный для сценария. Свободный текст
// вне этих слов не меняет статус (не гадаем).
function interpretWorkshopStatusUpdate(text: string): "in_progress" | "ready_for_pickup" | null {
  const normalized = text.toLowerCase();
  if (/готов/u.test(normalized)) return "ready_for_pickup";
  if (/в работ|начал|приступ/u.test(normalized)) return "in_progress";
  return null;
}

export interface CreateWorkshopInviteResult {
  code: string;
  expiresAt: Date;
  deepLink: string | null;
}

// Транспортный слой (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md) — не
// доменный use case; связывает уже существующие доменные операции
// (linkWorkshopTelegramChat) с фактическим Bot API webhook.
@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    @Inject(WORKSHOP_REPOSITORY) private readonly workshops: WorkshopRepository,
    @Inject(TELEGRAM_CLIENT) private readonly telegramClient: TelegramClient,
    private readonly inviteCodes: TelegramInviteCodeRepository,
    private readonly contractManufacturingService: ContractManufacturingService,
  ) {}

  async createWorkshopInvite(companyId: string, workshopId: string): Promise<CreateWorkshopInviteResult> {
    const workshop = await this.workshops.findById(companyId, workshopId);
    if (!workshop) {
      throw new Error(`Цех ${workshopId} не найден в этой компании`);
    }
    const invite = await this.inviteCodes.create(companyId, "workshop", workshopId);
    return { code: invite.code, expiresAt: invite.expiresAt, deepLink: this.buildDeepLink(invite.code) };
  }

  private buildDeepLink(code: string): string | null {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    return botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    if (!message?.text) {
      // Фото/голос/пересланные сообщения — часть обобщённого Inbox
      // (Итерация 9), в узком сценарии Итерации 7 не обрабатываются.
      return;
    }
    const chatId = String(message.chat.id);
    const text = message.text.trim();

    if (text.startsWith("/start")) {
      const code = text.slice("/start".length).trim();
      if (code) await this.handleInviteStart(chatId, code);
      return;
    }

    const workshop = await this.workshops.findByTelegramChatId(chatId);
    if (workshop) {
      await this.handleWorkshopReply(workshop.companyId, workshop.id, chatId, text);
      return;
    }

    await this.recordIncomingMessage(chatId, text, update.update_id);
  }

  // Простой входящий ответ цеха → обновление статуса самого свежего активного
  // заказа этого цеха (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 4).
  // Если сообщение не распознано как статус-обновление или у цеха нет
  // активных заказов — просто подтверждаем получение, ничего не меняя (не
  // гадаем финансово значимые решения, PRINCIPLES.md, принцип 17).
  private async handleWorkshopReply(companyId: string, workshopId: string, chatId: string, text: string): Promise<void> {
    const status = interpretWorkshopStatusUpdate(text);
    if (!status) {
      await this.telegramClient.sendMessage(chatId, "Принято.");
      return;
    }

    try {
      const order = await this.contractManufacturingService.updateProductionOrderStatusFromWorkshop(
        companyId,
        workshopId,
        status,
      );
      await this.telegramClient.sendMessage(chatId, `Статус заказа обновлён: ${order.status}.`);
    } catch (error) {
      this.logger.warn(`Не удалось обновить статус заказа для цеха ${workshopId}: ${String(error)}`);
      await this.telegramClient.sendMessage(chatId, "Принято.");
    }
  }

  private async handleInviteStart(chatId: string, code: string): Promise<void> {
    const invite = await this.inviteCodes.findValidByCode(code);
    if (!invite) {
      await this.telegramClient.sendMessage(chatId, "Код приглашения недействителен или уже использован.");
      return;
    }

    if (invite.targetType === "workshop") {
      await linkWorkshopTelegramChat(
        { workshops: this.workshops },
        { companyId: invite.companyId, workshopId: invite.targetId, telegramChatId: chatId },
      );
      await this.telegramClient.sendMessage(chatId, "Цех подключён. Сюда будут приходить спецификации на пошив.");
    } else {
      await this.db
        .insert(inboxChannels)
        .values({ companyId: invite.companyId, type: "telegram", externalIdentifier: chatId, isActive: true })
        .onConflictDoNothing();
      await this.telegramClient.sendMessage(
        chatId,
        "Готово. Опишите производственный запрос текстом или голосом — я подготовлю спецификацию.",
      );
    }

    await this.inviteCodes.markUsed(invite.id);
  }

  // Сообщение вне /start — либо от уже привязанного канала компании
  // (заказ на пошив, дальше по конвейеру AIClassifier, Итерация 7 таск #53),
  // либо от неизвестного отправителя (пока игнорируется — полноценная
  // AI-классификация всех входящих без привязки, Итерация 9).
  private async recordIncomingMessage(chatId: string, text: string, telegramUpdateId: number): Promise<void> {
    const [channel] = await this.db
      .select()
      .from(inboxChannels)
      .where(and(eq(inboxChannels.type, "telegram"), eq(inboxChannels.externalIdentifier, chatId)))
      .limit(1);
    if (!channel) {
      this.logger.warn(`Сообщение от непривязанного Telegram-чата ${chatId} — проигнорировано`);
      return;
    }

    try {
      await this.db.insert(inboxItems).values({
        companyId: channel.companyId,
        inboxChannelId: channel.id,
        sourceIdentifier: chatId,
        rawText: text,
        telegramUpdateId: String(telegramUpdateId),
        status: "new",
      });
    } catch (error) {
      // Уникальный индекс (inbox_channel_id, telegram_update_id) —
      // Telegram повторно доставил уже обработанный update
      // (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 5), это не ошибка.
      if (this.isUniqueViolation(error)) {
        this.logger.log(`Повторная доставка update ${telegramUpdateId} для чата ${chatId} — пропущено`);
        return;
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
  }
}
