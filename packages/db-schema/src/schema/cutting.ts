import { integer, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { productVariants } from "./catalog";
import { materials } from "./procurement";
import { productionOrders, workshops } from "./contract-manufacturing";

// Раскрой (владелец проекта, 2026-08-30) — наша собственная производственная
// операция между «заказ размещён» и «цех шьёт». Сознательно НЕ значение в
// production_order_status: тот статус описывает отношения с цехом, а цех
// присылает «начали шить» через Telegram в любой момент — будь раскрой
// статусом заказа, это сообщение молча выкинуло бы партию из раскроя.
//
// Раскройное задание ничего не копирует из заказа: матрица размер×цвет уже
// заморожена в production_order_variants, нормы и цены — в
// production_orders.cost_snapshot. Здесь хранится только то, чего нигде нет:
// решения человека (сколько выделено, сколько фактически ушло) и результат.

export const cuttingOrderStatusEnum = pgEnum("cutting_order_status", [
  "draft",
  "issued",
  "completed",
  "cancelled",
]);

// Кто кроит. Отдельная сущность исполнителя не заводится: подрядчик — обычный
// workshop, собственный раскрой — in_house (владелец проекта, 2026-08-30).
export const cuttingExecutorEnum = pgEnum("cutting_executor", ["in_house", "workshop"]);

export const cuttingOrders = pgTable(
  "cutting_orders",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    productionOrderId: uuid("production_order_id")
      .notNull()
      .references(() => productionOrders.id),
    // Порядковый номер задания внутри заказа. Уникален (заказ, номер), а не
    // (заказ) — докрой это следующее задание по тому же заказу со своим
    // планом, материалами, фактом и документом.
    number: integer("number").notNull(),
    status: cuttingOrderStatusEnum("status").notNull().default("draft"),
    executorType: cuttingExecutorEnum("executor_type").notNull().default("in_house"),
    // Обязателен при executor_type='workshop', запрещён при 'in_house' —
    // тот же инвариант, что уже действует для warehouses.workshop_id
    // (assertWorkshopIdConsistency), проверяется на application-уровне.
    executorWorkshopId: uuid("executor_workshop_id").references(() => workshops.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    comment: text("comment"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("cutting_orders_order_number_idx").on(table.productionOrderId, table.number),
  ],
);

// Материалы задания: план / выделено / факт. Остатка на складе тут нет —
// он живёт в material_stock_items; здесь только то, что относится к этому
// конкретному крою.
export const cuttingOrderMaterials = pgTable(
  "cutting_order_materials",
  {
    id: id(),
    cuttingOrderId: uuid("cutting_order_id")
      .notNull()
      .references(() => cuttingOrders.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    unit: text("unit").notNull(),
    // Потребность по нормам, зафиксированная в момент выдачи задания. Да, это
    // производная от норм партии — но при докрое задание покрывает часть
    // партии, и «требуется по заданию» не равно «требуется по партии»; плюс
    // план не должен переписываться фактом.
    requiredQuantity: numeric("required_quantity", { precision: 12, scale: 3 }).notNull(),
    allocatedQuantity: numeric("allocated_quantity", { precision: 12, scale: 3 }),
    consumedQuantity: numeric("consumed_quantity", { precision: 12, scale: 3 }),
    // Рулоны на этапе 5 — свободный текст («2 рулона: 700 + 600»), не
    // сущность: система не утверждает, что конкретный рулон предназначен
    // конкретному размеру (владелец проекта, 2026-08-30). Будущий учёт
    // рулонов ляжет дочерней таблицей к этой строке, ничего не ломая.
    rollNote: text("roll_note"),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("cutting_order_materials_order_material_idx").on(table.cuttingOrderId, table.materialId),
  ],
);

// Результат кроя по размеру и цвету — в ГОТОВЫХ изделиях/комплектах, одно
// число на ячейку. Количества «по каждому материалу» в модели нет вовсе,
// поэтому результат «4542 верха + 4300 подкладов» структурно невозможен:
// получить можно только 4300 комплектов (владелец проекта, 2026-08-30).
export const cuttingOrderResults = pgTable(
  "cutting_order_results",
  {
    id: id(),
    cuttingOrderId: uuid("cutting_order_id")
      .notNull()
      .references(() => cuttingOrders.id),
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id),
    plannedQuantity: numeric("planned_quantity", { precision: 12, scale: 3 }).notNull(),
    actualQuantity: numeric("actual_quantity", { precision: 12, scale: 3 }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("cutting_order_results_order_variant_idx").on(table.cuttingOrderId, table.productVariantId),
  ],
);
