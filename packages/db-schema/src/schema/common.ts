import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";

// docs/DATABASE_SCHEMA.md, раздел 15 (Общие/сквозные).

export const auditLog = pgTable("audit_log", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  userId: uuid("user_id").references(() => users.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  type: text("type").notNull(),
  payloadJson: jsonb("payload_json"),
  readAt: timestamp("read_at", { withTimezone: true }),
  ...auditColumns,
});

// Полиморфные сущности: entityType/entityId вместо REFERENCES на переменную
// таблицу — целостность проверяется на уровне application layer, не БД
// (осознанный компромисс, docs/DATABASE_SCHEMA.md, раздел 1 и
// docs/ARCHITECTURE_SELF_REVIEW.md, раздел 7).

export const documents = pgTable("documents", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  docType: text("doc_type").notNull(),
  fileUrl: text("file_url").notNull(),
  title: text("title"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  ...auditColumns,
});

export const notes = pgTable("notes", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
