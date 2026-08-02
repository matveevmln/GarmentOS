import { z } from "zod";

// Минимальная часть контракта Telegram Bot API update, которая нужна этой
// итерации (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md) — не наш собственный
// API-контракт (поэтому не в packages/shared-types), внешняя схема Telegram.
// .passthrough() — Telegram присылает намного больше полей, чем нам нужно;
// намеренно не валидируем их все строго.
export const telegramUpdateSchema = z
  .object({
    update_id: z.number(),
    message: z
      .object({
        message_id: z.number(),
        chat: z.object({ id: z.union([z.number(), z.string()]) }).passthrough(),
        text: z.string().optional(),
      })
      .passthrough()
      .optional(),
    // Нажатие inline-кнопки ("Подтвердить"/"Отменить" под предпросмотром
    // заказа, владелец проекта 2026-08-02) — альтернатива текстовому "Да",
    // не замена: обе формы подтверждения ведут в один и тот же обработчик.
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        message: z
          .object({
            message_id: z.number(),
            chat: z.object({ id: z.union([z.number(), z.string()]) }).passthrough(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>;
