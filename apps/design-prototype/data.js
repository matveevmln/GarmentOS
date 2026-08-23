/* Демонстрационные данные прототипа.
   ВАЖНО: каждое поле здесь соответствует реально существующему полю API
   GarmentOS. Ни одного выдуманного поля/статуса/метрики — см.
   docs/UI_UX_REDESIGN_PLAN.md §11. Значения условные (это прототип),
   структура — настоящая. */

// production_order_status — реальный enum из packages/db-schema
const STATUS = {
  draft:            { label: "Черновик",          short: "Черновик", cls: "s-draft" },
  placed:           { label: "Размещён",          short: "Размещён", cls: "s-placed" },
  in_progress:      { label: "В производстве",    short: "В работе", cls: "s-progress" },
  ready_for_pickup: { label: "Готово к отгрузке", short: "Готово",   cls: "s-ready" },
  received:         { label: "Принято",           short: "Принято",  cls: "s-received" },
  cancelled:        { label: "Отменён",           short: "Отменён",  cls: "s-cancelled" },
};
const STATUS_FLOW = ["draft", "placed", "in_progress", "ready_for_pickup", "received"];

const INVOICE_STATUS = {
  draft:     { label: "Черновик",  cls: "s-draft" },
  issued:    { label: "Выставлен", cls: "s-issued" },
  paid:      { label: "Оплачен",   cls: "s-paid" },
  overdue:   { label: "Просрочен", cls: "s-overdue" },
  cancelled: { label: "Отменён",   cls: "s-cancelled" },
};

const money = (n) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " ₽";
const money0 = (n) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";
const qty = (n) => new Intl.NumberFormat("ru-RU").format(n);

// ---- Партия #158 — BatchPassportResponseDto ----
const BATCH = {
  id: "158",
  status: "in_progress",
  plannedQuantity: 3000,
  agreedUnitPrice: 960.0,          // цена пошива, согласованная с цехом
  dueDate: "28.08.2026",
  daysOverdue: null,
  createdAt: "10.06.2026",
  product: { id: "p1", name: "Платье «Лана»" },
  workshop: {
    name: "Цех «Промода»",
    contractNumber: "П-22-04",
    contractDate: "22.04.2026",
    hasTelegramChat: true,
  },
  // costSnapshot — ProductionOrderCostSnapshot, реальные поля
  costSnapshot: {
    capturedAt: "10.06.2026 11:20",
    fabricCostPerUnit: 662.0,
    trimCostPerUnit: 76.0,
    packagingCostPerUnit: 32.0,
    sewingCostPerUnit: 180.0,
    otherCostPerUnit: 38.81,
    actualCostPerUnit: 988.81,
    deductionPerUnit: 28.81,
    specificationPricePerUnit: 960.0,
    materialsWithoutPriceHistory: [],
    paymentTerms: "70% в течение 3 рабочих дней после получения счёта, 30% при отгрузке со склада Исполнителя.",
    deliveryMethod: "Самовывоз",
    contractNumber: "П-22-04",
    contractDate: "22.04.2026",
    contractorName: "Цех «Промода»",
    customerName: "ООО «Мода Лав»",
  },
  variants: [
    { size: "42", color: "Пудровый", quantity: 400 },
    { size: "44", color: "Пудровый", quantity: 600 },
    { size: "46", color: "Пудровый", quantity: 500 },
    { size: "42", color: "Графит",   quantity: 400 },
    { size: "44", color: "Графит",   quantity: 650 },
    { size: "46", color: "Графит",   quantity: 450 },
  ],
  documents: [
    { id: "d1", docType: "specification", title: "Спецификация №12", issuedAt: "10.06.2026", isCurrentVersion: true,  version: 2 },
    { id: "d0", docType: "specification", title: "Спецификация №11", issuedAt: "08.06.2026", isCurrentVersion: false, version: 1 },
  ],
  invoices: [
    { id: "i1", status: "paid",   amount: 2016000, dueDate: "15.06.2026" },
    { id: "i2", status: "issued", amount: 864000,  dueDate: "28.08.2026" },
  ],
  // timeline — из audit_log, реальные action
  timeline: [
    { label: "Заказ создан",                          occurredAt: "10.06.2026 09:15", who: "Богдан М.", state: "done" },
    { label: "Заказ подтверждён, Snapshot зафиксирован", occurredAt: "10.06.2026 11:20", who: "Богдан М.", state: "done" },
    { label: "Спецификация №11 сформирована",          occurredAt: "08.06.2026 12:04", who: "Богдан М.", state: "done" },
    { label: "Спецификация №12 сформирована (версия 2)", occurredAt: "10.06.2026 11:22", who: "Богдан М.", state: "done" },
    { label: "Цех сообщил: в работе",                  occurredAt: "14.06.2026 09:00", who: "Цех «Промода»", state: "current" },
  ],
};

BATCH.total = BATCH.plannedQuantity * BATCH.costSnapshot.specificationPricePerUnit;
BATCH.paid = BATCH.invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
BATCH.due = BATCH.total - BATCH.paid;

const COST_ROWS = [
  { name: "Ткань",     per: 662.0, color: "var(--info)" },
  { name: "Пошив",     per: 180.0, color: "var(--primary)" },
  { name: "Фурнитура", per: 76.0,  color: "var(--warning)" },
  { name: "Упаковка",  per: 32.0,  color: "var(--success)" },
  { name: "Прочее",    per: 38.81, color: "var(--neutral)" },
];

// ---- Список партий ----
const BATCHES = [
  { id: "158", product: "Платье «Лана»",  workshop: "Промода", qty: 3000, status: "in_progress",      total: 2880000, due: "28.08.2026", overdue: null },
  { id: "157", product: "Костюм «Лира»",  workshop: "Ак-Сай",  qty: 1800, status: "placed",           total: 1542600, due: "25.08.2026", overdue: null },
  { id: "156", product: "Платье «Миа»",   workshop: "Швей-Цех",qty: 2500, status: "in_progress",      total: 2145750, due: "30.08.2026", overdue: null },
  { id: "155", product: "Платье «Эми»",   workshop: "Промода", qty: 1200, status: "ready_for_pickup", total: 918240,  due: "20.08.2026", overdue: 3 },
  { id: "154", product: "Костюм «Элла»",  workshop: "Ак-Сай",  qty: 800,  status: "received",         total: 612320,  due: "15.08.2026", overdue: null },
  { id: "153", product: "Топ «Софт»",     workshop: "Швей-Цех",qty: 3200, status: "draft",            total: null,    due: null,         overdue: null },
  { id: "152", product: "Платье «Нора»",  workshop: "Промода", qty: 2000, status: "cancelled",        total: null,    due: null,         overdue: null },
];

// ---- Модели (products) — фото в схеме нет ----
const MODELS = [
  { id: "p1", name: "Платье «Лана»", code: "DR-LANA",  variants: 6, bom: "утверждён" },
  { id: "p2", name: "Платье «Миа»",  code: "DR-MIA",   variants: 9, bom: "утверждён" },
  { id: "p3", name: "Костюм «Лира»", code: "ST-LIRA",  variants: 6, bom: "утверждён" },
  { id: "p4", name: "Платье «Эми»",  code: "DR-EMI",   variants: 4, bom: "утверждён" },
  { id: "p5", name: "Топ «Софт»",    code: "TP-SOFT",  variants: 8, bom: "черновик" },
  { id: "p6", name: "Костюм «Элла»", code: "ST-ELLA",  variants: 6, bom: "утверждён" },
];

// ---- Материалы (materials) — остатков нет, GET /material-stock отсутствует ----
const MATERIALS = [
  { name: "Ткань футер 2-х нитка", code: "FTR-220-001", type: "fabric",    unit: "м",  supplier: "Текстиль Плюс" },
  { name: "Подклад вискоза",        code: "VSC-130-001", type: "fabric",    unit: "м",  supplier: "Текстиль Плюс" },
  { name: "Нитки армированные",     code: "THR-40-001",  type: "trim",      unit: "шт", supplier: "Фурнитура М" },
  { name: "Бирка тканевая",         code: "LBL-01",      type: "trim",      unit: "шт", supplier: "Фурнитура М" },
  { name: "Пакет упаковочный",      code: "PKG-40x60",   type: "packaging", unit: "шт", supplier: "ПакСервис" },
];
const MATERIAL_TYPE = { fabric: "Ткань", trim: "Фурнитура", packaging: "Упаковка" };

// ---- Закупки (purchase_orders) ----
const PURCHASES = [
  { id: "З-341", supplier: "Текстиль Плюс", positions: 3, sum: 1986000, status: "received", expected: "05.06.2026" },
  { id: "З-342", supplier: "Фурнитура М",   positions: 2, sum: 228000,  status: "sent",     expected: "18.08.2026" },
  { id: "З-343", supplier: "ПакСервис",     positions: 1, sum: 96000,   status: "draft",    expected: null },
];
const PO_STATUS = {
  draft:     { label: "Черновик",  cls: "s-draft" },
  sent:      { label: "Отправлена",cls: "s-placed" },
  received:  { label: "Получена",  cls: "s-ready" },
  cancelled: { label: "Отменена",  cls: "s-cancelled" },
};

const WAREHOUSES = [
  { name: "Основной склад",     type: "Собственный", location: "Бишкек" },
  { name: "Склад цеха Промода", type: "У подрядчика", location: "Бишкек" },
  { name: "Фулфилмент Москва",  type: "Партнёрский",  location: "Москва" },
];

const SUPPLIERS = [
  { name: "Текстиль Плюс", type: "Ткани",     status: "Активен" },
  { name: "Фурнитура М",   type: "Фурнитура", status: "Активен" },
  { name: "ПакСервис",     type: "Упаковка",  status: "Активен" },
];

const WORKSHOPS = [
  { name: "Цех «Промода»",  contract: "П-22-04", spec: 12, telegram: true },
  { name: "Цех «Ак-Сай»",   contract: "А-11-02", spec: 8,  telegram: true },
  { name: "Цех «Швей-Цех»", contract: "Ш-05-09", spec: 4,  telegram: false },
];

const ALL_DOCS = [
  { title: "Спецификация №12", type: "Спецификация", batch: "Партия #158", date: "10.06.2026", ver: 2, current: true },
  { title: "Спецификация №11", type: "Спецификация", batch: "Партия #158", date: "08.06.2026", ver: 1, current: false },
  { title: "Спецификация №10", type: "Спецификация", batch: "Партия #157", date: "05.06.2026", ver: 1, current: true },
  { title: "Спецификация №9",  type: "Спецификация", batch: "Партия #156", date: "01.06.2026", ver: 1, current: true },
];
