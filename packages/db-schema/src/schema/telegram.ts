import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared";

// docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 1 — привязка компании
// (или, для Итерации 7, отдельного цеха — раздел 2 того же документа)
// к Telegram-чату через одноразовый инвайт-код, а не напрямую по company_id/
// workshop_id: сам по себе company_id не секрет (возвращается в ответах API),
// значение конкретной привязки — что код одноразовый, с ограниченным сроком
// действия, и потребление кода (used_at) делает повторную привязку по тому
// же коду невозможной.
export const telegramInviteTargetTypeEnum = pgEnum("telegram_invite_target_type", ["company", "workshop"]);

export const telegramInviteCodes = pgTable("telegram_invite_codes", {
  id: id(),
  code: text("code").notNull().unique(),
  targetType: telegramInviteTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
