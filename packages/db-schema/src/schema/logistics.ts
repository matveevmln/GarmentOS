import { numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { productVariants } from "./catalog";
import { suppliers } from "./procurement";
import { warehouses } from "./warehouse";

// docs/DATABASE_SCHEMA.md, раздел 10 (Logistics & Export).
// Часть модуля Warehouse & Inventory, не отдельный bounded context.
// Простая сущность отгрузки для MVP — не полноценный таможенный модуль
// (декларации и т.п. — как documents, не структурированные поля здесь).

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "planned",
  "in_transit",
  "customs_clearance",
  "delivered",
  "cancelled",
]);

export const shipments = pgTable("shipments", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  originWarehouseId: uuid("origin_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  destinationWarehouseId: uuid("destination_warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  // FK на suppliers с type='logistics' (транспортная компания) — проверяется
  // на уровне application layer, не CHECK-constraint между таблицами.
  carrierId: uuid("carrier_id").references(() => suppliers.id),
  status: shipmentStatusEnum("status").notNull().default("planned"),
  trackingNumber: text("tracking_number"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
});

export const shipmentItems = pgTable("shipment_items", {
  id: id(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  ...auditColumns,
});
