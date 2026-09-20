import { sql } from "drizzle-orm";
import { type AnyPgColumn, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies, users } from "./identity";
import { products, productVariants } from "./catalog";
import { productionOrders, workshops } from "./contract-manufacturing";

// Спецификация — редактируемый документ (ПРОМПТ №2/№2.1, владелец проекта,
// уточнено 2026-09-16 — «Production Order → Specification»). ДВА
// одновременно живых, ВЗАИМНО ИСКЛЮЧАЮЩИХ по направлению потока пути:
//
// LEGACY (Production Master, 2026-09-11): спецификация создаётся ДО партии,
// проходит draft -> approve (снимок замораживается, номер резервируется),
// партия создаётся ИЗ утверждённой спецификации и ссылается на неё через
// production_orders.specification_id (contract-manufacturing.ts). Этот путь
// НЕ меняется и не удаляется — читается только для обратной совместимости.
//
// NEW (ПРОМПТ №3): партия создаётся ПЕРВОЙ. Специфика создаётся кнопкой
// «Создать спецификацию» ИЗ уже существующей партии и ссылается на неё через
// specifications.production_order_id (эта колонка, ниже) — обратное
// направление FK, не то же самое поле. Номер резервируется СРАЗУ при
// создании (не при approve), статус выставляется сразу 'approved' (то же
// значение enum, что и legacy — physически enum не меняется, п.6
// ПРОМПТ №2.1 — но для нового потока это означает не «согласовано», а просто
// «не черновик, готов к использованию»), редактирование строк разрешено в
// любой момент, пока status != 'cancelled' (не только пока 'draft', как в
// legacy). PDF генерируется из ТЕКУЩЕГО состояния специфики (не из
// snapshot_json — тот остаётся только для legacy-пути и для коммерческих
// полей cost_snapshot партии, см. specification.service.ts).
//
// Обе колонки-связи (production_orders.specification_id ЗДЕСЬ,
// specifications.production_order_id НИЖЕ) — НЕ конкурирующие источники
// истины для одной и той же пары: каждая пишется только своим потоком,
// никогда обеими одновременно для одной пары заказ+спецификация. Единая
// точка чтения — resolveOrderSpecificationLink
// (apps/api/src/specification/order-specification-link.resolver.ts).
export const specificationStatusEnum = pgEnum("specification_status", ["draft", "approved", "cancelled"]);

export const specifications = pgTable(
  "specifications",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    // Исполнитель по договору — тот же цех, что владеет атомарным счётчиком
    // номеров (workshops.nextSpecificationNumber, переиспользуется без
    // изменений: точка резервирования номера просто сдвигается с генерации
    // PDF заказа на утверждение спецификации).
    workshopId: uuid("workshop_id")
      .notNull()
      .references(() => workshops.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    // NEW-поток (ПРОМПТ №3): заказ, ИЗ которого создана эта спецификация —
    // 1:1 (одна партия -> максимум одна спецификация нового потока; в
    // отличие от legacy-направления, где 1 спецификация -> N партий).
    // NULL для спецификаций, созданных legacy-путём (там связь обратная —
    // production_orders.specification_id).
    productionOrderId: uuid("production_order_id").references(() => productionOrders.id),
    // Номер, который буквально появляется в тексте PDF («Спецификация №7») —
    // NULL, пока черновик не утверждён (владелец проекта, требование №11:
    // резервируется атомарно в момент approve, не при создании черновика —
    // так брошенные черновики не оставляют дыр в нумерации).
    specNumber: integer("spec_number"),
    status: specificationStatusEnum("status").notNull().default("draft"),
    // На случай правки черновика до утверждения (см. updateSpecificationDraft) —
    // растёт при каждой замене строк, пока status='draft'. После approve
    // никогда не меняется — правка утверждённой спецификации запрещена
    // целиком (требование №9), а не только этим полем.
    version: integer("version").notNull().default(1),
    // «Создать на основе существующей» (требование №3) — это НЕ supersedes
    // (Document Engine, замена/версия ОДНОГО документа): обе спецификации,
    // источник и копия, остаются одновременно действующими независимыми
    // документами. Поле чисто информационное (происхождение), не влияет на
    // жизненный цикл ни одной из сторон.
    basedOnSpecificationId: uuid("based_on_specification_id").references(
      (): AnyPgColumn => specifications.id,
    ),
    deliveryDeadline: date("delivery_deadline"),
    totalQuantity: numeric("total_quantity", { precision: 12, scale: 3 }).notNull(),
    totalSum: numeric("total_sum", { precision: 14, scale: 2 }).notNull(),
    // Спецификации для цехов — всегда в RUB независимо от валюты учёта
    // компании (docs/PRINCIPLES.md, принцип 21; identity.ts, комментарий к
    // companies.defaultCurrency) — явное поле, а не молчаливое допущение.
    totalSumCurrency: text("total_sum_currency").notNull().default("RUB"),
    // Предоплата 70% (требование №7) — рассчитывается backend при approve,
    // NULL у черновика (нечего фиксировать, пока сумма может измениться).
    prepaymentAmount: numeric("prepayment_amount", { precision: 14, scale: 2 }),
    // Snapshot (требование №4, №9, №10) — застывшие на момент approve: модель
    // (name/code), реквизиты цеха (contractNumber/contractDate/paymentTerms/
    // deliveryMethod/legalAddress/подписанты), реквизиты компании
    // (legalName/подписант), строки и итоги. NULL у черновика — тот факт,
    // что снимок ещё не сделан, не маскируется пустым объектом.
    snapshotJson: jsonb("snapshot_json"),
    createdBy: uuid("created_by").references(() => users.id),
    ...auditColumns,
  },
  (table) => [
    // Защита от дублей номера (требование №11) — партиальный индекс, как и
    // companies_bootstrap_key_idx: не мешает множеству черновиков с
    // NULL-номером сосуществовать, но гарантирует уникальность реального
    // номера в рамках цеха на уровне БД, не только атомарным счётчиком.
    uniqueIndex("specifications_workshop_number_idx")
      .on(table.workshopId, table.specNumber)
      .where(sql`${table.specNumber} IS NOT NULL`),
    index("specifications_company_status_idx").on(table.companyId, table.status),
    index("specifications_based_on_idx").on(table.basedOnSpecificationId),
    // 1:1 для NEW-потока — одна партия не может породить две спецификации
    // этим путём (сколько угодно раз можно перегенерировать PDF, но не
    // создать вторую строку specifications для того же заказа).
    uniqueIndex("specifications_production_order_idx")
      .on(table.productionOrderId)
      .where(sql`${table.productionOrderId} IS NOT NULL`),
  ],
);

export const specificationItems = pgTable("specification_items", {
  id: id(),
  specificationId: uuid("specification_id")
    .notNull()
    .references(() => specifications.id),
  productVariantId: uuid("product_variant_id")
    .notNull()
    .references(() => productVariants.id),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull(),
  // Сумма строки хранится, а не только вычисляется на лету — та же причина,
  // что и у production_order_variants: строка спецификации, попавшая в
  // snapshot и PDF, должна остаться читаемой без пересчёта даже если позже
  // поменяется правило округления. Backend всегда пересчитывает и проверяет
  // при записи (требование о расчётах на backend), не доверяя присланному
  // значению вслепую.
  sum: numeric("sum", { precision: 14, scale: 2 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
  ...auditColumns,
});
