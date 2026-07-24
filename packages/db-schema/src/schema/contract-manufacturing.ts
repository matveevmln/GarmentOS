import { boolean, date, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id, softDelete } from "./_shared";
import { companies, users } from "./identity";
import { products, productVariants } from "./catalog";
import { boms } from "./bom";
import { partnerStatusEnum } from "./procurement";

// docs/DATABASE_SCHEMA.md, раздел 8 (Contract Manufacturing).
// Мы не производим — размещаем и контролируем заказы у независимых
// подрядных цехов (см. раздел 0). Не переносить сюда production_stages
// (крой/пошив/ОТК) — операционка чужого цеха, нам недоступна и не нужна.

export const productionOrderStatusEnum = pgEnum("production_order_status", [
  // draft — создан автоматически Inbox из входящего сообщения, ещё не
  // подтверждён пользователем (docs/INBOX_ARCHITECTURE.md, раздел 2.1).
  "draft",
  "placed",
  "in_progress",
  "ready_for_pickup",
  "received",
  "cancelled",
]);

export const workshops = pgTable("workshops", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  name: text("name").notNull(),
  inn: text("inn"),
  contactInfo: text("contact_info"),
  specialization: text("specialization"),
  // status вместо булева is_active — единообразно с suppliers, и поддерживает
  // черновик, создаваемый Inbox при первом упоминании незнакомого цеха
  // (docs/INBOX_ARCHITECTURE.md, раздел 2.1).
  status: partnerStatusEnum("status").notNull().default("active"),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
  ...softDelete,
});

export const productionOrders = pgTable("production_orders", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  bomId: uuid("bom_id")
    .notNull()
    .references(() => boms.id),
  workshopId: uuid("workshop_id")
    .notNull()
    .references(() => workshops.id),
  plannedQuantity: numeric("planned_quantity", { precision: 12, scale: 3 }).notNull(),
  agreedUnitPrice: numeric("agreed_unit_price", { precision: 14, scale: 2 }).notNull(),
  materialsProvidedByUs: boolean("materials_provided_by_us").notNull().default(true),
  status: productionOrderStatusEnum("status").notNull().default("placed"),
  dueDate: date("due_date"),
  // Фактическая дата завершения — без неё нельзя сравнить план (due_date) и
  // факт для рейтинга цеха и алертов о просрочке (USER_JOURNEY_AUDIT.md, пробел №5).
  receivedAt: timestamp("received_at", { withTimezone: true }),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
});

export const productionOrderVariants = pgTable("production_order_variants", {
  id: id(),
  productionOrderId: uuid("production_order_id")
    .notNull()
    .references(() => productionOrders.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  ...auditColumns,
});
