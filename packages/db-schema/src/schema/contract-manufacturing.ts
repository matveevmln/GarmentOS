import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  // Telegram Bot API не позволяет проактивно написать в чат, который ни разу
  // не взаимодействовал с ботом (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md) —
  // цех должен сначала перейти по приглашению (telegram_invite_codes),
  // только тогда бот узнаёт chat_id и может присылать сюда PDF-спецификации.
  telegramChatId: text("telegram_chat_id"),
  // Рамочный договор с этим цехом (номер/дата) — спецификации нумеруются
  // как приложения к нему ("Спецификация №N к договору №X от Y г.", эталон
  // 2026-07-26). Не отдельный модуль договоров — минимум, нужный только для
  // корректного заголовка спецификации; nullable, пока договор не заведён.
  contractNumber: text("contract_number"),
  contractDate: text("contract_date"),
  // Следующий номер спецификации по этому договору — атомарно увеличивается
  // при каждой генерации (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, Итерация 7).
  nextSpecificationNumber: integer("next_specification_number").notNull().default(1),
  // Постоянные условия спецификации (владелец проекта, 2026-08-02: "остаются
  // неизменными, пока пользователь сам их не изменит в настройках") — до этой
  // правки generateAndSendSpecification подставляла сюда пустые строки, хотя
  // поля уже присутствуют в самом шаблоне (Document Template Engine).
  paymentTerms: text("payment_terms"),
  deliveryMethod: text("delivery_method"),
  // Кто подписывает спецификацию со стороны цеха — должность и ФИО,
  // выводятся в блок подписи ("Генеральный директор" / "Нормуродов О.А.").
  signerRole: text("signer_role"),
  signerName: text("signer_name"),
  createdBy: uuid("created_by").references(() => users.id),
  ...auditColumns,
  ...softDelete,
});

export const productionOrders = pgTable(
  "production_orders",
  {
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
    // Snapshot партии (владелец проекта, 2026-08-03 — "Паспорт партии",
    // docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, раздел "Snapshot
    // партии"). Фиксируется ОДИН раз при подтверждении заказа (draft→placed):
    // разбивка себестоимости на момент подтверждения (ткань/фурнитура/
    // упаковка/пошив/прочее по текущим закупочным ценам), условия оплаты,
    // реквизиты договора и подписантов, которые тогда действовали. После
    // фиксации НИКОГДА не пересчитывается — даже если позже изменятся цены
    // материалов, BOM модели или карточка цеха (ProductionOrderCostSnapshot,
    // @garmentos/shared-types). null у заказов, подтверждённых до появления
    // этого механизма — для них спецификация продолжает считать вживую
    // (обратная совместимость, production-order-orchestration.service.ts).
    costSnapshot: jsonb("cost_snapshot"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [
    // docs/DATABASE_SCHEMA.md, раздел 17 — «заказы с риском просрочки»
    // (ARCHITECTURE_REVIEW.md, находка 4.1: отсутствовал в фактической
    // миграции, хотя был задокументирован как обязательный).
    index("production_orders_company_status_due_idx").on(table.companyId, table.status, table.dueDate),
  ],
);

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
