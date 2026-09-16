import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { productionOrders, productionOrderVariants } from "./contract-manufacturing";
import { productVariants } from "./catalog";
import { productionOrderQcResults } from "./quality-control";

// Брак и компенсация (ПРОМПТ №10.2, этап B, владелец проекта, 2026-09-15) —
// структурированная замена одинокого числа production_order_qc_results.defect_quantity.
// Сознательно НЕ вводится агрегат production_batches: дефект и компенсация
// висят прямо на уже существующем production_orders — том же, что уже
// служит "партией" (см. PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, §26.4).
//
// production_order_defects — факт брака, привязанный к конкретной партии.
// qcResultId — откуда взят факт (обычно ОТК, см. QcService.record), nullable
// на случай ручного заведения брака отдельно от формы ОТК в будущем.
// productVariantId — nullable: NULL = общий брак без разбивки по SKU
// ("просто 100 шт"), заполнено — брак конкретного размера/цвета.
export const productionOrderDefects = pgTable(
  "production_order_defects",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    qcResultId: uuid("qc_result_id").references(() => productionOrderQcResults.id),
    productVariantId: uuid("product_variant_id").references(() => productVariants.id),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    reason: text("reason"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [
    index("production_order_defects_order_idx").on(table.companyId, table.productionOrderId),
    index("production_order_defects_qc_result_idx").on(table.qcResultId),
    check("production_order_defects_quantity_positive_check", sql`${table.quantity} > 0`),
  ],
);

// production_order_defect_compensations — явная связь "этот дефект решён вот
// этой строкой вот этого нового заказа". НИКОГДА не создаётся автоматически
// одним лишь наличием sourceProductionOrderId/variantType='rework' на новом
// заказе (владелец проекта, ПРОМПТ №10.2, п.3) — только явным подтверждением
// пользователя через use case createDefectCompensation.
// compensatingVariantId nullable — компенсация может быть привязана к
// конкретной rework-строке нового заказа, но это необязательно (заказ мог
// быть создан без разбивки по вариантам на момент компенсации).
export const productionOrderDefectCompensations = pgTable(
  "production_order_defect_compensations",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    defectId: uuid("defect_id")
      .notNull()
      .references(() => productionOrderDefects.id),
    compensatingProductionOrderId: uuid("compensating_production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    compensatingVariantId: uuid("compensating_variant_id").references(() => productionOrderVariants.id),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("production_order_defect_compensations_defect_idx").on(table.defectId),
    index("production_order_defect_compensations_order_idx").on(table.compensatingProductionOrderId),
    check("production_order_defect_compensations_quantity_positive_check", sql`${table.quantity} > 0`),
  ],
);
