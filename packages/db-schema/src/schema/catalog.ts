import { integer, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id, softDelete } from "./_shared";
import { companies, users } from "./identity";

// docs/DATABASE_SCHEMA.md, раздел 5 (Catalog).

export const collectionStatusEnum = pgEnum("collection_status", [
  "planning",
  "active",
  "archived",
]);

export const collectionSeasonEnum = pgEnum("collection_season", [
  "spring",
  "summer",
  "autumn",
  "winter",
]);

export const productStatusEnum = pgEnum("product_status", ["draft", "active", "discontinued"]);

export const collections = pgTable(
  "collections",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    season: collectionSeasonEnum("season"),
    year: integer("year"),
    status: collectionStatusEnum("status").notNull().default("planning"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [uniqueIndex("collections_company_name_idx").on(table.companyId, table.name)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    // Nullable — не каждая модель обязана входить в формальную коллекцию
    // (docs/DATABASE_SCHEMA.md, раздел 5).
    collectionId: uuid("collection_id").references(() => collections.id),
    name: text("name").notNull(),
    code: text("code").notNull(),
    category: text("category"),
    season: text("season"),
    status: productStatusEnum("status").notNull().default("draft"),
    // Ссылка на текущий файл техпака/спецификации через StorageAdapter.
    // Архив версий/доп. соглашений — через таблицу documents (common.ts).
    techPackUrl: text("tech_pack_url"),
    // Плановые составляющие себестоимости, не выводимые из BOM (ткань/
    // фурнитура/упаковка уже считаются из bom_items × цена материала —
    // docs/PRODUCT_MODEL_ARCHITECTURE.md, раздел 6): стоимость пошива за
    // единицу — прямой ввод (стандартная цена цеха для планирования нового
    // запуска, до того как конкретный цех согласован для партии) и прочие
    // производственные расходы за единицу (владелец проекта, 2026-08-03 —
    // расчёт стоимости спецификации).
    standardSewingCost: numeric("standard_sewing_cost", { precision: 14, scale: 2 }),
    otherProductionCost: numeric("other_production_cost", { precision: 14, scale: 2 }),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
    ...softDelete,
  },
  (table) => [uniqueIndex("products_company_code_idx").on(table.companyId, table.code)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    size: text("size").notNull(),
    color: text("color").notNull(),
    skuCode: text("sku_code").notNull(),
    barcode: text("barcode"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
    ...softDelete,
  },
  (table) => [uniqueIndex("product_variants_sku_idx").on(table.skuCode)],
);
