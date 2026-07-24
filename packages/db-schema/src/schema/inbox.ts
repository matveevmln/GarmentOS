import {
  boolean,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";

// docs/DATABASE_SCHEMA.md, раздел 15 (Inbox). Полная архитектура pipeline —
// docs/INBOX_ARCHITECTURE.md. Эти таблицы не хранят доменное состояние —
// только сырые входящие сообщения и предложения AI; подтверждение вызывает
// обычные application services других модулей (INBOX_ARCHITECTURE.md, раздел 2).

export const inboxChannelTypeEnum = pgEnum("inbox_channel_type", [
  "telegram",
  "whatsapp",
  "wechat",
  "email",
  "upload",
]);

export const inboxItemStatusEnum = pgEnum("inbox_item_status", [
  "new",
  "processing",
  "suggested",
  "confirmed",
  "rejected",
  "ignored",
]);

export const inboxSuggestionStatusEnum = pgEnum("inbox_suggestion_status", [
  "pending",
  "accepted",
  "rejected",
  "edited_and_accepted",
]);

export const inboxChannels = pgTable("inbox_channels", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  type: inboxChannelTypeEnum("type").notNull(),
  // Bot chat id / email-алиас / внешний идентификатор канала.
  externalIdentifier: text("external_identifier").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...auditColumns,
});

export const inboxItems = pgTable("inbox_items", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  inboxChannelId: uuid("inbox_channel_id")
    .notNull()
    .references(() => inboxChannels.id),
  // Кто прислал — телефон/Telegram-хэндл отправителя (может отличаться от
  // владельца канала при пересланных сообщениях, docs/INBOX_ARCHITECTURE.md
  // раздел 1) — используется для entity linking (раздел 7).
  sourceIdentifier: text("source_identifier"),
  rawText: text("raw_text"),
  // Через StorageAdapter (docs/INFRASTRUCTURE.md, п.2.3); для ZIP/email с
  // несколькими вложениями — один inbox_item на файл после распаковки.
  fileUrl: text("file_url"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  status: inboxItemStatusEnum("status").notNull().default("new"),
  ...auditColumns,
});

export const inboxSuggestions = pgTable("inbox_suggestions", {
  id: id(),
  inboxItemId: uuid("inbox_item_id")
    .notNull()
    .references(() => inboxItems.id),
  // Не жёсткий enum на уровне БД (как documents.doc_type) — валидируется в
  // application layer, чтобы новые типы предложений не требовали миграции
  // (docs/INBOX_ARCHITECTURE.md, раздел 6).
  suggestionType: text("suggestion_type").notNull(),
  extractedData: jsonb("extracted_data"),
  // Полиморфная ссылка (как documents/notes, docs/DATABASE_SCHEMA.md раздел 1):
  // либо на существующую найденную сущность, либо на черновик, созданный
  // одновременно с этим предложением (docs/INBOX_ARCHITECTURE.md, раздел 2.1).
  suggestedEntityType: text("suggested_entity_type"),
  suggestedEntityId: uuid("suggested_entity_id"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }),
  status: inboxSuggestionStatusEnum("status").notNull().default("pending"),
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  ...auditColumns,
});
