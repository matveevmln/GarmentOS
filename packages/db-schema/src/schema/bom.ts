import { integer, numeric, pgEnum, pgTable, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { products } from "./catalog";
import { materials } from "./procurement";

// docs/DATABASE_SCHEMA.md, раздел 7 (BOM).
// tech_specs удалена по итогам аудита (раздел 0) — не переносится сюда.

export const bomStatusEnum = pgEnum("bom_status", ["draft", "approved", "archived"]);

export const boms = pgTable("boms", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  version: integer("version").notNull().default(1),
  status: bomStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
});

export const bomItems = pgTable("bom_items", {
  id: id(),
  bomId: uuid("bom_id")
    .notNull()
    .references(() => boms.id),
  materialId: uuid("material_id")
    .notNull()
    .references(() => materials.id),
  quantityPerUnit: numeric("quantity_per_unit", { precision: 12, scale: 3 }).notNull(),
  wastePercent: numeric("waste_percent", { precision: 5, scale: 2 }).notNull().default("0"),
  ...auditColumns,
});
