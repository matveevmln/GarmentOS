import { Inject, Injectable, Logger } from "@nestjs/common";
import { inboxChannels, inboxItems, type Database } from "@garmentos/db-schema";
import { linkWorkshopTelegramChat, type WorkshopRepository } from "@garmentos/domain-contract-manufacturing";
import { and, eq } from "drizzle-orm";
import { DATABASE_CONNECTION } from "../database/database.module";
import { CatalogService } from "../catalog/catalog.service";
import { WORKSHOP_REPOSITORY } from "../contract-manufacturing/contract-manufacturing.tokens";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import {
  ProductionRequestOrchestrationError,
  type ProductionRequestPreview,
  ProductionOrderOrchestrationService,
} from "../ai-production-assistant/production-order-orchestration.service";
import { ProductionRequestParseError } from "../ai-production-assistant/ai-classifier";
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

const STATUS_LABELS: Record<string, string> = {
  in_progress: "в работе",
  ready_for_pickup: "готово к отгрузке",
  received: "принято",
  cancelled: "отменён",
};

function isConfirmationReply(text: string): boolean {
  return /^(да|подтверждаю|верно|ок|окей)[.!]?$/iu.test(text.trim());
}

// Callback_data inline-кнопок предпросмотра (владелец проекта, 2026-08-02) —
// альтернатива текстовому "Да", не замена: пользователь может нажать кнопку
// или написать текстом, оба пути ведут в один обработчик (confirmPending/
// cancelPending ниже).
export const CONFIRM_CALLBACK_DATA = "confirm_production_request";
export const CANCEL_CALLBACK_DATA = "cancel_production_request";

// Форматирование предпросмотра в читаемое сообщение (требование владельца
// проекта 2026-07-26: "AI должен показать, что именно понял, какие данные
// нашёл автоматически, какие данные отсутствуют и какие потенциальные
// проблемы обнаружил" — не просто Да/Нет). Только форматирование текста —
// все решения (что найдено/чего не хватает/можно ли создавать) уже принял
// ProductionOrderOrchestrationService, это не бизнес-логика.
function formatPreviewMessage(preview: ProductionRequestPreview): string {
  const colorTotals = new Map<string, number>();
  for (const item of preview.items) {
    colorTotals.set(item.colorName, (colorTotals.get(item.colorName) ?? 0) + item.quantity);
  }

  const lines: string[] = ["Я понял заказ:", "", `• Модель: ${preview.modelName}`];
  lines.push(`• Цех: ${preview.workshopName ?? "не определён"}`);
  for (const [colorName, quantity] of colorTotals) {
    lines.push(`• Цвет ${colorName} — ${quantity} шт.`);
  }
  if (preview.unitPrice !== null) lines.push(`• Цена пошива: ${preview.unitPrice} руб.`);
  lines.push("");

  if (preview.warnings.length > 0) {
    lines.push(...preview.warnings.map((warning) => `⚠ ${warning}`));
    lines.push("");
  }

  if (preview.canCreate) {
    lines.push("Будет создано:", "• Производственный заказ", "• Спецификация PDF", "• Документы", "");
    lines.push("Нажмите «Подтвердить» ниже, ответьте «Да», или пришлите исправленные данные.");
  } else {
    lines.push("Пришлите исправленный текст запроса — заказ пока не может быть создан.");
  }

  return lines.join("\n");
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
    private readonly orchestrationService: ProductionOrderOrchestrationService,
    private readonly catalogService: CatalogService,
  ) {}

  async createWorkshopInvite(companyId: string, workshopId: string): Promise<CreateWorkshopInviteResult> {
    const workshop = await this.workshops.findById(companyId, workshopId);
    if (!workshop) {
      throw new Error(`Цех ${workshopId} не найден в этой компании`);
    }
    const invite = await this.inviteCodes.create(companyId, "workshop", workshopId);
    return { code: invite.code, expiresAt: invite.expiresAt, deepLink: this.buildDeepLink(invite.code) };
  }

  // Привязка собственного чата компании — без этого сценарий "текст в
  // Telegram → заказ" (Итерация 7) недостижим: цеха получают приглашение
  // через createWorkshopInvite выше, но у владельца/менеджера компании не
  // было симметричного способа привязать свой чат.
  async createCompanyInvite(companyId: string): Promise<CreateWorkshopInviteResult> {
    const invite = await this.inviteCodes.create(companyId, "company", companyId);
    return { code: invite.code, expiresAt: invite.expiresAt, deepLink: this.buildDeepLink(invite.code) };
  }

  private buildDeepLink(code: string): string | null {
    const botUsername = process.env.TELEGRAM_BOT_USERNAME;
    return botUsername ? `https://t.me/${botUsername}?start=${code}` : null;
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (update.callback_query) {
      await this.handleCallbackQuery(update.callback_query);
      return;
    }

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

    const channel = await this.findCompanyChannel(chatId);
    if (channel) {
      await this.handleCompanyMessage(channel.companyId, chatId, text, update.update_id);
      return;
    }

    this.logger.warn(`Сообщение от непривязанного Telegram-чата ${chatId} — проигнорировано`);
  }

  // Сценарий "текст → предпросмотр → подтверждение → заказ" (требование
  // владельца проекта 2026-07-26): Telegram — тонкий интерфейс, вся бизнес-
  // логика (разбор, резолв модели/BOM/цеха/SKU, создание заказа, генерация
  // спецификации, отправка цеху) — в ProductionOrderOrchestrationService,
  // этот метод только маршрутизирует и форматирует ответ.
  private async handleCompanyMessage(companyId: string, chatId: string, text: string, telegramUpdateId: number): Promise<void> {
    if (isConfirmationReply(text)) {
      await this.confirmPending(chatId);
      return;
    }

    try {
      const preview = await this.orchestrationService.previewFromTextForChannel(companyId, chatId, text);
      const inlineKeyboard = preview.canCreate
        ? [
            [
              { text: "✅ Подтвердить", callbackData: CONFIRM_CALLBACK_DATA },
              { text: "❌ Отменить", callbackData: CANCEL_CALLBACK_DATA },
            ],
          ]
        : undefined;
      await this.telegramClient.sendMessage(chatId, formatPreviewMessage(preview), { inlineKeyboard });
    } catch (error) {
      if (error instanceof ProductionRequestParseError) {
        // Свободный текст вне строгого формата — сохраняем как inbox_item,
        // не пытаемся угадать (полноценная классификация свободного текста —
        // Итерация 9, Universal Inbox).
        await this.recordIncomingMessage(chatId, text, telegramUpdateId);
        return;
      }
      throw error;
    }
  }

  // Общий обработчик подтверждения — вызывается и из текстового "Да", и из
  // нажатия inline-кнопки "Подтвердить" (владелец проекта, 2026-08-02):
  // одна и та же бизнес-логика независимо от способа подтверждения.
  private async confirmPending(chatId: string): Promise<void> {
    if (!this.orchestrationService.hasPendingRequest(chatId)) {
      await this.telegramClient.sendMessage(chatId, "Нет запроса, ожидающего подтверждения. Опишите, что нужно сшить.");
      return;
    }
    try {
      const { order, document } = await this.orchestrationService.confirmPendingRequest(chatId, null);
      await this.telegramClient.sendMessage(
        chatId,
        `Готово. Заказ пошива создан и подтверждён (статус: ${order.status}). Спецификация сформирована и отправлена цеху.`,
      );
      this.logger.log(`Создан заказ ${order.id}, документ спецификации ${document.id} (чат ${chatId})`);
    } catch (error) {
      const message = error instanceof ProductionRequestOrchestrationError ? error.message : "Не удалось создать заказ — попробуйте ещё раз.";
      await this.telegramClient.sendMessage(chatId, message);
    }
  }

  // Нажатие "Отменить" — явно снимает предпросмотр, ожидающий подтверждения
  // (владелец проекта, 2026-08-02), не дожидаясь TTL (15 минут).
  private async cancelPending(chatId: string): Promise<void> {
    const cancelled = this.orchestrationService.cancelPendingRequest(chatId);
    await this.telegramClient.sendMessage(
      chatId,
      cancelled ? "Отменено. Опишите новый заказ, когда будете готовы." : "Нет запроса, ожидающего подтверждения.",
    );
  }

  // Inline-кнопки под предпросмотром ("✅ Подтвердить"/"❌ Отменить") —
  // Telegram Bot API требует answerCallbackQuery даже когда ответ не нужен
  // (иначе кнопка у пользователя виснет с "часиками").
  private async handleCallbackQuery(callbackQuery: NonNullable<TelegramUpdate["callback_query"]>): Promise<void> {
    await this.telegramClient.answerCallbackQuery(callbackQuery.id);
    const chatId = callbackQuery.message ? String(callbackQuery.message.chat.id) : null;
    if (!chatId) return;

    if (callbackQuery.data === CONFIRM_CALLBACK_DATA) {
      await this.confirmPending(chatId);
    } else if (callbackQuery.data === CANCEL_CALLBACK_DATA) {
      await this.cancelPending(chatId);
    }
  }

  private async findCompanyChannel(chatId: string): Promise<{ companyId: string; id: string } | null> {
    const [channel] = await this.db
      .select()
      .from(inboxChannels)
      .where(and(eq(inboxChannels.type, "telegram"), eq(inboxChannels.externalIdentifier, chatId)))
      .limit(1);
    return channel ?? null;
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
      await this.notifyCompanyOfWorkshopStatus(companyId, workshopId, order.productId, order.status);
    } catch (error) {
      this.logger.warn(`Не удалось обновить статус заказа для цеха ${workshopId}: ${String(error)}`);
      await this.telegramClient.sendMessage(chatId, "Принято.");
    }
  }

  // Без этого владелец узнавал о статусе заказа, только запросив его напрямую
  // через API (владелец проекта, 2026-08-02: "я вообще не должен заходить в
  // Swagger или Postman") — рассылается во все привязанные Telegram-каналы
  // компании (обычно один, но не ограничиваемся этим).
  private async notifyCompanyOfWorkshopStatus(
    companyId: string,
    workshopId: string,
    productId: string,
    status: string,
  ): Promise<void> {
    const [workshop, product, channels] = await Promise.all([
      this.workshops.findById(companyId, workshopId),
      this.catalogService.findProductById(companyId, productId),
      this.findActiveChannelsByCompany(companyId),
    ]);
    if (channels.length === 0) return;

    const statusLabel = STATUS_LABELS[status] ?? status;
    const message = `Цех «${workshop?.name ?? workshopId}»: заказ «${product?.name ?? productId}» — ${statusLabel}.`;
    for (const channel of channels) {
      await this.telegramClient.sendMessage(channel.externalIdentifier, message);
    }
  }

  private async findActiveChannelsByCompany(companyId: string): Promise<{ externalIdentifier: string }[]> {
    return this.db
      .select({ externalIdentifier: inboxChannels.externalIdentifier })
      .from(inboxChannels)
      .where(
        and(eq(inboxChannels.companyId, companyId), eq(inboxChannels.type, "telegram"), eq(inboxChannels.isActive, true)),
      );
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

  // Сообщение вне строгого формата производственного запроса — сохраняем
  // как inbox_item (полноценная AI-классификация всех входящих без привязки
  // к конкретному сценарию — Итерация 9, Universal Inbox).
  private async recordIncomingMessage(chatId: string, text: string, telegramUpdateId: number): Promise<void> {
    const channel = await this.findCompanyChannel(chatId);
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
