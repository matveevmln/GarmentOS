import { numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { productionOrders } from "./contract-manufacturing";

// ОТК (P4, владелец проекта, 2026-09-06) — результат приёмочного контроля
// партии: сколько реально получено, сколько годных, сколько брака. Отдельный
// бизнес-результат, не статус заказа: production_order_status не меняется
// (тот статус описывает отношения с цехом и уже дошёл до терминального
// "received" к моменту, когда ОТК вообще может появиться). Тот же принцип,
// что уже применён к раскрою (packages/db-schema/src/schema/cutting.ts) —
// решение человека живёт в собственной узкой таблице, не примешивается в
// production_orders.
//
// Один финальный результат на заказ (Pilot v1): уникальный индекс на
// production_order_id — не таблица истории попыток, а именно факт "приняли
// с таким качеством". Исправление результата и переделка брака — вне
// объёма этого этапа (rework, P5).
export const productionOrderQcResults = pgTable(
  "production_order_qc_results",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    receivedQuantity: numeric("received_quantity", { precision: 12, scale: 3 }).notNull(),
    goodQuantity: numeric("good_quantity", { precision: 12, scale: 3 }).notNull(),
    defectQuantity: numeric("defect_quantity", { precision: 12, scale: 3 }).notNull(),
    comment: text("comment"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [uniqueIndex("production_order_qc_results_order_idx").on(table.productionOrderId)],
);
