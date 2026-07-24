import { numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { productVariants } from "./catalog";
import { workshops } from "./contract-manufacturing";

// docs/DATABASE_SCHEMA.md, раздел 9 (Warehouse & Inventory).

export const warehouseTypeEnum = pgEnum("warehouse_type", [
  "own",
  "workshop",
  "marketplace_fbo",
  "consignment",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "receipt",
  "dispatch",
  "adjustment",
  "transfer",
]);

export const inventoryCountStatusEnum = pgEnum("inventory_count_status", [
  "in_progress",
  "completed",
  "cancelled",
]);

export const warehouses = pgTable(
  "warehouses",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    name: text("name").notNull(),
    type: warehouseTypeEnum("type").notNull().default("own"),
    // Собственные склады могут физически находиться в разных странах —
    // основа для отгрузок/экспорта (docs/DATABASE_SCHEMA.md, раздел 0b/10).
    country: text("country"),
    // Обязателен, когда type = 'workshop'; проверяется на уровне application layer
    // (docs/DATABASE_SCHEMA.md, раздел 16 — CHECK-constraint или app-level).
    workshopId: uuid("workshop_id").references(() => workshops.id),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [uniqueIndex("warehouses_company_name_idx").on(table.companyId, table.name)],
);

export const stockItems = pgTable(
  "stock_items",
  {
    id: id(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id),
    quantityOnHand: numeric("quantity_on_hand", { precision: 12, scale: 3 }).notNull().default("0"),
    quantityReserved: numeric("quantity_reserved", { precision: 12, scale: 3 })
      .notNull()
      .default("0"),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("stock_items_warehouse_variant_idx").on(table.warehouseId, table.productVariantId),
  ],
);

export const stockMovements = pgTable("stock_movements", {
  id: id(),
  stockItemId: uuid("stock_item_id")
    .notNull()
    .references(() => stockItems.id),
  type: stockMovementTypeEnum("type").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  // Полиморфная ссылка на источник движения (production_order, purchase_order,
  // shipment, order, inventory_count, ...) — см. соглашение в _shared.ts/documents.
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
});

export const inventoryCounts = pgTable("inventory_counts", {
  id: id(),
  warehouseId: uuid("warehouse_id")
    .notNull()
    .references(() => warehouses.id),
  status: inventoryCountStatusEnum("status").notNull().default("in_progress"),
  performedBy: uuid("performed_by").references(() => users.id),
  performedAt: timestamp("performed_at", { withTimezone: true }),
  ...auditColumns,
});

export const inventoryCountItems = pgTable("inventory_count_items", {
  id: id(),
  inventoryCountId: uuid("inventory_count_id")
    .notNull()
    .references(() => inventoryCounts.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  expectedQuantity: numeric("expected_quantity", { precision: 12, scale: 3 }).notNull(),
  actualQuantity: numeric("actual_quantity", { precision: 12, scale: 3 }).notNull(),
  discrepancy: numeric("discrepancy", { precision: 12, scale: 3 }).notNull(),
  ...auditColumns,
});
