import { date, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies } from "./identity";
import { productVariants } from "./catalog";
import { productionOrders } from "./contract-manufacturing";
import { purchaseOrders } from "./procurement";
import { orders } from "./sales";

// docs/DATABASE_SCHEMA.md, раздел 14 (Finance).
// Прибыль/маржа не хранится — вычисляется из orders + cost_entries
// (read-model Reporting/BI), см. docs/DATABASE_SCHEMA.md, раздел 14.

export const transactionTypeEnum = pgEnum("transaction_type", ["income", "expense"]);

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "issued",
  "paid",
  "overdue",
  "cancelled",
]);

export const costEntries = pgTable("cost_entries", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  productionOrderId: uuid("production_order_id").references(() => productionOrders.id),
  materialCost: numeric("material_cost", { precision: 14, scale: 2 }).notNull(),
  // Услуга подрядного цеха (закупленная услуга по agreed_unit_price),
  // не внутренний нормо-час (docs/DATABASE_SCHEMA.md, раздел 0/14).
  manufacturingCost: numeric("manufacturing_cost", { precision: 14, scale: 2 }).notNull(),
  logisticsCost: numeric("logistics_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  overheadCost: numeric("overhead_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  ...auditColumns,
});

export const transactions = pgTable("transactions", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  ...auditColumns,
});

export const invoices = pgTable("invoices", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  orderId: uuid("order_id").references(() => orders.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrders.id),
  productionOrderId: uuid("production_order_id").references(() => productionOrders.id),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  dueDate: date("due_date"),
  ...auditColumns,
});
