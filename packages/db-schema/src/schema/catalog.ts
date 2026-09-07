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
    // Валюта каждой суммы — своя, не выводится из типа расхода (P1, hardening
    // перед первой партией «Стеганка», владелец проекта, 2026-09-07): раньше
    // costing.service.ts жёстко считал обе суммы в RUB, из-за чего услугу
    // стёжки (реально в KGS) невозможно было завести, не смешав валюты молча.
    // Для уже существующих строк (заведённых до этого поля) миграция
    // проставляет "RUB" — это ровно то значение, которое раньше подразумевалось
    // жёстко в коде, поэтому подстановка не меняет уже посчитанные партии.
    standardSewingCostCurrency: text("standard_sewing_cost_currency"),
    otherProductionCost: numeric("other_production_cost", { precision: 14, scale: 2 }),
    otherProductionCostCurrency: text("other_production_cost_currency"),
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

// Размерный ряд модели: порядок размеров и пропорция раскладки (владелец
// проекта, 2026-08-30). Отдельная таблица, а не колонки в product_variants:
// там размер повторяется на каждый цвет (при 3 цветах «48-50» лежит в трёх
// строках), и вес пришлось бы хранить тремя копиями, которые разъедутся.
// Порядка размеров в схеме не было вовсе — «48-50 идёт раньше 52-54» до сих
// пор выводилось из порядка создания SKU (известное упрощение,
// contract-manufacturing.service.ts).
//
// ratioWeight — вес, а не готовое количество и не процент: владелец вводит
// свои рабочие числа (185/381/381/381/186), система масштабирует их на любой
// объём. Сумма весов ничему не обязана равняться.
//
// Версий у таблицы нет намеренно: результат применения раскладки навсегда
// лежит в строках заказа (production_order_variants), поэтому правка ряда
// не может задеть уже созданные заказы — гарантия структурой, не дисциплиной.
export const productSizes = pgTable(
  "product_sizes",
  {
    id: id(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    size: text("size").notNull(),
    sortOrder: integer("sort_order").notNull(),
    ratioWeight: numeric("ratio_weight", { precision: 12, scale: 3 }).notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex("product_sizes_product_size_idx").on(table.productId, table.size)],
);
