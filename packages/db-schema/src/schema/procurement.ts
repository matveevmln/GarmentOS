import { date, index, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id, softDelete } from "./_shared";
import { companies, users } from "./identity";

// docs/DATABASE_SCHEMA.md, раздел 6 (Materials & Procurement).

export const materialTypeEnum = pgEnum("material_type", [
  "fabric",
  "trim",
  "packaging",
  "accessory",
]);

export const materialUnitEnum = pgEnum("material_unit", ["m", "kg", "pcs"]);

export const supplierTypeEnum = pgEnum("supplier_type", [
  "fabric",
  "trim",
  "packaging",
  "logistics",
]);

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "sent",
  "partially_received",
  "received",
  "cancelled",
]);

// Общий статус для партнёров (suppliers/workshops) — draft создаётся Inbox
// при первом упоминании незнакомого контрагента в документе, не требует
// подтверждения для появления в списке (docs/INBOX_ARCHITECTURE.md, раздел 2.1).
export const partnerStatusEnum = pgEnum("partner_status", ["draft", "active", "archived"]);

export const materials = pgTable(
  "materials",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    type: materialTypeEnum("type").notNull(),
    unit: materialUnitEnum("unit").notNull(),
    reorderPoint: numeric("reorder_point", { precision: 12, scale: 3 }),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
    ...softDelete,
  },
);

// Поставщики — категоризированы (docs/DATABASE_SCHEMA.md, раздел 0b): не только
// материалов, но и упаковки, и транспортных компаний (используются как
// shipments.carrierId). Один поставщик = одна основная категория для MVP.
export const suppliers = pgTable("suppliers", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  type: supplierTypeEnum("type").notNull(),
  status: partnerStatusEnum("status").notNull().default("active"),
  inn: text("inn"),
  contactInfo: text("contact_info"),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
  ...softDelete,
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: purchaseOrderStatusEnum("status").notNull().default("draft"),
    // Бизнес-дата фактического размещения заказа — отдельно от created_at
    // (системная дата) и expectedDate (план поставки). Основа отчёта истории
    // закупочных цен (docs/DATABASE_SCHEMA.md, раздел 0b/6).
    orderedAt: date("ordered_at").notNull(),
    expectedDate: date("expected_date"),
    // Валюта закупки (принцип 21: ткань закупается в USD, фурнитура в KGS).
    // Хранится рядом с суммой, а не выводится из типа материала: вывод —
    // скрытое правило, которое молча сломается на первой упаковке,
    // купленной за доллары. Nullable: у закупок, заведённых до появления
    // поля, валюта неизвестна, и подставлять её задним числом нельзя —
    // интерфейс честно показывает «валюта не указана».
    currency: text("currency"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [index("purchase_orders_supplier_ordered_idx").on(table.supplierId, table.orderedAt)],
);

export const purchaseOrderItems = pgTable(
  "purchase_order_items",
  {
    id: id(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
    ...auditColumns,
  },
  // Индекс под отчёт "история цен по материалу" (docs/DATABASE_SCHEMA.md, раздел 16).
  (table) => [index("purchase_order_items_material_idx").on(table.materialId)],
);
