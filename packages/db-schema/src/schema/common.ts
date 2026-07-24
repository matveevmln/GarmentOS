import {
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
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

// documents — только файл и его метаданные, БЕЗ привязки к сущности
// (docs/DATABASE_SCHEMA.md, раздел 0e/принцип 18): один документ обычно
// относится сразу к нескольким объектам (инвойс — к закупке И к поставщику
// И к материалу), поэтому связи вынесены в отдельную many-to-many таблицу
// document_links ниже, а не хранятся как одна пара entity_type/entity_id
// на самом документе.
//
// Immutable Original (docs/PRINCIPLES.md, принцип 19): file_url этой строки
// никогда не изменяется после создания — это гарантируется на уровне БД
// триггером (см. drizzle/0005_document_immutability_trigger.sql, написан
// вручную — drizzle-kit не умеет генерировать триггеры). Новая версия
// файла — это НОВАЯ строка documents со ссылкой на предыдущую через
// supersedesDocumentId, а не UPDATE существующей.
export const documents = pgTable(
  "documents",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    docType: text("doc_type").notNull(),
    fileUrl: text("file_url").notNull(),
    title: text("title"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    // Версионность (docs/PRINCIPLES.md, принцип 19; docs/DATABASE_SCHEMA.md, п.0f):
    // Price_v1.xlsx → Price_final.xlsx → Price_final_NEW.xlsx — три файла, но
    // одна логическая история. supersedesDocumentId указывает на предыдущую
    // версию; isCurrentVersion — денормализованный флаг для быстрого «покажи
    // актуальный вариант» без обхода цепочки.
    supersedesDocumentId: uuid("supersedes_document_id").references(
      (): AnyPgColumn => documents.id,
    ),
    isCurrentVersion: boolean("is_current_version").notNull().default(true),
    ...auditColumns,
  },
  (table) => [
    index("documents_company_current_idx").on(table.companyId, table.isCurrentVersion),
    index("documents_supersedes_idx").on(table.supersedesDocumentId),
  ],
);

// Производные данные (docs/PRINCIPLES.md, принцип 19): "Original document is
// the source of truth. AI only creates derived data." OCR/перевод/структурное
// извлечение/AI-саммари — отдельные строки, ссылающиеся на неизменяемый
// оригинал, а не перезапись documents.file_url. Реобработка (например, более
// точный OCR) создаёт НОВУЮ строку, не обновляет старую — та же философия
// append-only, хоть и не защищена триггером так строго, как сам оригинал.
export const documentDerivativeTypeEnum = pgEnum("document_derivative_type", [
  "ocr_text",
  "translation",
  "structured_data",
  "ai_summary",
]);

export const documentDerivatives = pgTable(
  "document_derivatives",
  {
    id: id(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    type: documentDerivativeTypeEnum("type").notNull(),
    // Текст (ocr_text/translation/ai_summary) — {"text": "..."}; структурные
    // поля (structured_data) — сам объект извлечённых полей.
    content: jsonb("content").notNull(),
    // Язык результата — осмыслен для translation, NULL для остальных типов.
    language: text("language"),
    // Какая модель/сервис произвели этот результат — важно для доверия при
    // спорных ситуациях ("это AI перевёл неточно, вот исходная версия").
    generatedBy: text("generated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("document_derivatives_document_idx").on(table.documentId)],
);

export const documentLinkSourceEnum = pgEnum("document_link_source", ["ai", "manual"]);

// Полиморфная связь many-to-many: один документ — много сущностей, одна
// сущность — много документов. entityType/entityId — как и в audit_log/notes
// выше: без REFERENCES на переменную таблицу, целостность — на уровне
// application layer (docs/DATABASE_SCHEMA.md, раздел 1). companyId продублирован
// здесь намеренно (не только через document_id → documents.company_id) —
// это единственная таблица, где entity_id полиморфен И относится к чужому
// тенанту потенциально без пути проверки через FK; наличие company_id прямо
// на строке — защита от утечки между компаниями на уровне запроса.
export const documentLinks = pgTable(
  "document_links",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    // NULL — связь добавлена вручную (source=manual), не AI.
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    source: documentLinkSourceEnum("source").notNull(),
    linkedBy: uuid("linked_by").references(() => users.id),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Главный запрос: «все документы этой сущности» — карточка модели/материала/закупки.
    index("document_links_entity_idx").on(table.entityType, table.entityId),
    // Обратный запрос: «ко всем сущностям привязан этот файл».
    index("document_links_document_idx").on(table.documentId),
  ],
);

// notes остаётся один-к-одному (не many-to-many, как documents): комментарий
// пользователя написан в контексте одной конкретной сущности, даже если
// упоминает другие — в отличие от инвойса/фото, которые самостоятельно
// относятся сразу к нескольким объектам бизнеса.
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
