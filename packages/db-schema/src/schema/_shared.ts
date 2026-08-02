import { timestamp, uuid } from "drizzle-orm/pg-core";

// Общие колонки для каждой доменной таблицы (docs/DATABASE_SCHEMA.md, раздел 1).
// `createdBy` не включён сюда намеренно (во избежание циклического импорта
// с identity.ts) — добавляется в каждой таблице как
// `createdBy: uuid("created_by").references(() => users.id)`.
export const id = () => uuid("id").defaultRandom().primaryKey();

export const auditColumns = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const softDelete = {
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
