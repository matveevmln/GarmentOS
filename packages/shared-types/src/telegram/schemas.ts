import { z } from "zod";

// Контракты транспортного модуля Telegram Integration
// (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md) — не отдельный доменный
// bounded context, тот же принцип, что и Inbox (не требует
// packages/domain/telegram, docs/INBOX_ARCHITECTURE.md).

export const createTelegramInviteSchema = z.object({
  // Итерация 7: только цех — привязка компании (владелец/директор) заводится
  // отдельно, вне этого узкого сценария (docs/ROADMAP.md, Итерация 7).
  workshopId: z.string().uuid(),
});
export type CreateTelegramInviteDto = z.infer<typeof createTelegramInviteSchema>;

export const telegramInviteResponseSchema = z.object({
  code: z.string(),
  expiresAt: z.date(),
  // null, если TELEGRAM_BOT_USERNAME не настроен в этом окружении —
  // ссылку тогда собирает вызывающая сторона вручную по коду.
  deepLink: z.string().nullable(),
});
export type TelegramInviteResponseDto = z.infer<typeof telegramInviteResponseSchema>;
