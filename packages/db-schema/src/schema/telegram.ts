import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { companies } from "./identity";

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
  // Всегда компания-владелец target (для target_type='company' совпадает с
  // target_id) — нужен, чтобы найти цех через WorkshopRepository.findById,
  // который принимает companyId явно (мультитенантность на уровне запроса,
  // docs/ARCHITECTURE.md раздел 6), не для того, чтобы обойти её.
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  targetType: telegramInviteTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
