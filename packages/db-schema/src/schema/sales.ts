import { numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies } from "./identity";
import { productVariants } from "./catalog";

// docs/DATABASE_SCHEMA.md, раздел 11 (Sales & Orders).

export const salesChannelTypeEnum = pgEnum("sales_channel_type", [
  "marketplace",
  "wholesale",
  "retail",
  "own_website",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "new",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
]);

export const salesChannels = pgTable("sales_channels", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  type: salesChannelTypeEnum("type").notNull(),
  name: text("name").notNull(),
  ...auditColumns,
});

export const orders = pgTable("orders", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  salesChannelId: uuid("sales_channel_id")
    .notNull()
    .references(() => salesChannels.id),
  externalOrderId: text("external_order_id"),
  status: orderStatusEnum("status").notNull().default("new"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull(),
  orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
  ...auditColumns,
});

export const orderItems = pgTable("order_items", {
  id: id(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  ...auditColumns,
});
