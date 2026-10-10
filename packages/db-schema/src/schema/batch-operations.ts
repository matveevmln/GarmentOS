import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { companies, users } from "./identity";
import { productionOrders } from "./contract-manufacturing";
import { transactions } from "./finance";
import { warehouses } from "./warehouse";

// Append-only facts. Client UUID is also the idempotency key; corrections never
// erase the original receipt or money movement.
export const batchPayments = pgTable(
  "batch_payments",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    direction: text("direction").notNull(),
    currency: text("currency").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note").notNull().default(""),
    reversalOfId: uuid("reversal_of_id").references((): AnyPgColumn => batchPayments.id),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("batch_payments_company_order_idx").on(t.companyId, t.productionOrderId),
    uniqueIndex("batch_payments_reversal_idx").on(t.reversalOfId),
    uniqueIndex("batch_payments_transaction_idx").on(t.transactionId),
    check("batch_payments_amount_positive", sql`${t.amount} > 0`),
    check("batch_payments_currency_rub", sql`${t.currency} = 'RUB'`),
    check("batch_payments_direction", sql`${t.direction} in ('payment', 'refund')`),
  ],
);

export const receiptCorrections = pgTable(
  "receipt_corrections",
  {
    id: uuid("id").primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    reason: text("reason").notNull(),
    beforeVariants: jsonb("before_variants")
      .$type<Array<{ productVariantId: string; quantity: number }>>()
      .notNull(),
    afterVariants: jsonb("after_variants")
      .$type<Array<{ productVariantId: string; quantity: number }>>()
      .notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("receipt_corrections_company_order_idx").on(t.companyId, t.productionOrderId)],
);
