import { numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id } from "./_shared";
import { companies, users } from "./identity";

// Сохраняемые числовые значения (ПРОМПТ №2/№3, раздел 5/11) — «стоимость
// пошива» и «цена спецификации» вводятся не свободным текстом каждый раз, а
// выбираются из списка ранее использованных значений на компанию, с
// возможностью добавить новое (оно сохраняется для следующего раза). Два
// независимых набора (kind) — одна таблица, не две: смешивать их запрещено
// на уровне приложения (presets.service.ts), не схемой.
//
// Не история цен и не аудит — просто маленький растущий словарь удобных
// значений, поэтому нет auditColumns/updatedAt/deletedAt: значения не
// редактируются и не удаляются, только добавляются (append-only).
export const numericValuePresetKindEnum = pgEnum("numeric_value_preset_kind", [
  "sewing_cost",
  "specification_price",
]);

export const numericValuePresets = pgTable(
  "numeric_value_presets",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    kind: numericValuePresetKindEnum("kind").notNull(),
    value: numeric("value", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Не даёт добавить дубликат того же значения того же вида в той же
    // валюте — повторный ввод "450" просто выбирает уже существующий пресет,
    // не плодит копии.
    uniqueIndex("numeric_value_presets_company_kind_value_currency_idx").on(
      table.companyId,
      table.kind,
      table.value,
      table.currency,
    ),
  ],
);
