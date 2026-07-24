import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies } from "./identity";
import { productVariants } from "./catalog";
import { productionOrders } from "./contract-manufacturing";

// docs/DATABASE_SCHEMA.md, раздел 13 (Honest Sign / Честный Знак).
// Обязанность по маркировке лежит на нас как на продавце/импортёре товара
// в оборот РФ — актуальность модуля не меняется тем, что мы не производитель.

export const markingCodeStatusEnum = pgEnum("marking_code_status", [
  "issued",
  "applied",
  "introduced",
  "sold",
  "retired",
  "damaged",
]);

export const markingCodes = pgTable("marking_codes", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  codeValue: text("code_value").notNull().unique(),
  status: markingCodeStatusEnum("status").notNull().default("issued"),
  productionOrderId: uuid("production_order_id").references(() => productionOrders.id),
  ...auditColumns,
});

export const markingCodeEvents = pgTable("marking_code_events", {
  id: id(),
  markingCodeId: uuid("marking_code_id")
    .notNull()
    .references(() => markingCodes.id),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  payloadJson: jsonb("payload_json"),
  ...auditColumns,
});
