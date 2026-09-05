import { z } from "zod";

// Контракты модуля Contract Manufacturing (docs/ARCHITECTURE.md, раздел 3;
// CLAUDE.md, глоссарий: workshop — независимый подрядный цех, productionOrder
// — заказ на пошив у workshop, не путать с закупкой материалов).

export const workshopStatusSchema = z.enum(["draft", "active", "archived"]);

export const createWorkshopSchema = z.object({
  name: z.string().min(1, "Название цеха не может быть пустым"),
  inn: z.string().optional(),
  contactInfo: z.string().optional(),
  specialization: z.string().optional(),
  status: workshopStatusSchema.optional(),
  // Рамочный договор с цехом — спецификации нумеруются как приложения к нему
  // (Document Template Engine, эталон 2026-07-26). Необязательны — заполняются,
  // когда договор с этим цехом уже заключён.
  contractNumber: z.string().optional(),
  contractDate: z.string().optional(),
  // Постоянные условия спецификации — заполняются один раз в настройках
  // цеха, подставляются автоматически в каждую сгенерированную спецификацию
  // (владелец проекта, 2026-08-02). Необязательны — остаются пустыми, пока
  // не заданы.
  paymentTerms: z.string().optional(),
  deliveryMethod: z.string().optional(),
  signerRole: z.string().optional(),
  signerName: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateWorkshopDto = z.infer<typeof createWorkshopSchema>;

// Правка карточки цеха (Pilot v1, этап 1). Без неё договорные реквизиты,
// заданные при создании, нельзя исправить: подтверждение заказа пошива
// требует номер договора и сообщает «заполните его в карточке цеха», а
// самой карточки до этого не существовало.
//
// Семантика PATCH: поле не передано — не меняется; передана пустая строка —
// значение очищается (то же приведение пустой строки к null, что и в
// createWorkshop). Поэтому `name` здесь тоже min(1) — название очистить
// нельзя, оно обязательно у цеха.
export const updateWorkshopSchema = z
  .object({
    name: z.string().min(1, "Название цеха не может быть пустым").optional(),
    inn: z.string().optional(),
    contactInfo: z.string().optional(),
    specialization: z.string().optional(),
    status: workshopStatusSchema.optional(),
    contractNumber: z.string().optional(),
    contractDate: z.string().optional(),
    paymentTerms: z.string().optional(),
    deliveryMethod: z.string().optional(),
    signerRole: z.string().optional(),
    signerName: z.string().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Не передано ни одного поля для изменения",
  });
export type UpdateWorkshopDto = z.infer<typeof updateWorkshopSchema>;

export const workshopResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  inn: z.string().nullable(),
  contactInfo: z.string().nullable(),
  specialization: z.string().nullable(),
  status: workshopStatusSchema,
  telegramChatId: z.string().nullable(),
  contractNumber: z.string().nullable(),
  contractDate: z.string().nullable(),
  nextSpecificationNumber: z.number(),
  paymentTerms: z.string().nullable(),
  deliveryMethod: z.string().nullable(),
  signerRole: z.string().nullable(),
  signerName: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type WorkshopResponseDto = z.infer<typeof workshopResponseSchema>;

export const productionOrderStatusSchema = z.enum([
  "draft",
  "placed",
  "in_progress",
  "ready_for_pickup",
  "received",
  "cancelled",
]);

export const productionOrderVariantDraftSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type ProductionOrderVariantDraft = z.infer<typeof productionOrderVariantDraftSchema>;

export const createProductionOrderSchema = z.object({
  productId: z.string().uuid(),
  bomId: z.string().uuid(),
  workshopId: z.string().uuid(),
  plannedQuantity: z.number().positive(),
  agreedUnitPrice: z.number().min(0),
  materialsProvidedByUs: z.boolean().optional(),
  dueDate: z.string().optional(),
  variants: z
    .array(productionOrderVariantDraftSchema)
    .min(1, "Заказ пошива должен содержать хотя бы одну строку разбивки по SKU"),
  createdBy: z.string().uuid().optional(),
});
export type CreateProductionOrderDto = z.infer<typeof createProductionOrderSchema>;

// Создание заказа пошива по общему количеству, без ручной разбивки по
// SKU (владелец проекта, 2026-08-03 — «указываю только общее количество,
// размерный ряд система распределяет автоматически»). Цвет не указывается —
// используется единственный цвет модели; если у модели несколько цветов,
// общее количество делится между ними поровну, затем внутри каждого цвета —
// по размерам (см. contract-manufacturing.service.ts).
export const createProductionOrderFromQuantitySchema = z.object({
  productId: z.string().uuid(),
  bomId: z.string().uuid(),
  workshopId: z.string().uuid(),
  totalQuantity: z.number().int().positive(),
  agreedUnitPrice: z.number().min(0),
  materialsProvidedByUs: z.boolean().optional(),
  dueDate: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateProductionOrderFromQuantityDto = z.infer<typeof createProductionOrderFromQuantitySchema>;

// Приёмка партии на склад (Итерация 10) — склад, на который зачисляются все
// SKU заказа, выбирается человеком при приёмке (в отличие от материалов,
// авторезолв единственного склада компании здесь не подходит: заказ пошива —
// это готовая продукция, которая может приходить на другой склад, чем сырьё).
export const receiveProductionOrderSchema = z.object({
  warehouseId: z.string().uuid(),
});
export type ReceiveProductionOrderDto = z.infer<typeof receiveProductionOrderSchema>;

// REST-путь смены статуса заказа (владелец проекта, 2026-09-05) — тот же
// узкий набор переходов, что цех сегодня сообщает через Telegram
// (assertCanUpdateStatusFromWorkshop), но вызывается по конкретному id
// заказа, не через "последний активный заказ цеха". "received" сюда не
// входит — приёмка остаётся отдельным эндпоинтом (receiveProductionOrderSchema),
// потому что зачисляет остаток на склад, а не просто меняет статус.
export const updateProductionOrderStatusSchema = z.object({
  status: z.enum(["in_progress", "ready_for_pickup"]),
});
export type UpdateProductionOrderStatusDto = z.infer<typeof updateProductionOrderStatusSchema>;

export const productionOrderVariantResponseSchema = z.object({
  id: z.string().uuid(),
  productionOrderId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Snapshot партии (владелец проекта, 2026-08-03 — «Паспорт партии»,
// docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, раздел «Snapshot
// партии»). Фиксируется один раз при подтверждении заказа (draft→placed) —
// разбивка себестоимости по ценам материалов на тот момент + условия
// оплаты/реквизиты договора/подписанты, которые тогда действовали в
// карточке цеха. После фиксации не пересчитывается никогда, даже если
// позже изменятся цены материалов, BOM модели или сама карточка цеха —
// именно этот снимок, а не текущие карточки, служит источником данных для
// каждой спецификации, сгенерированной по этому заказу (в т.ч. повторно
// через месяц).
// Норма расхода одного материала, зафиксированная в момент подтверждения
// заказа (Pilot v1, этап 4). Владелец проекта, требование исторической
// памяти: «Стеганка 2,6 м → партия хранит 2,6; позже норма стала 2,4 →
// новая партия получает 2,4, старая остаётся 2,6».
//
// До этого этапа снимок замораживал только деньги, а сама норма читалась из
// живой карточки модели — то есть у старой партии она менялась задним
// числом. Теперь норма лежит в снимке рядом с ценой.
export const productionOrderMaterialNormSchema = z.object({
  materialId: z.string().uuid(),
  materialName: z.string(),
  materialType: z.string(),
  unit: z.string(),
  quantityPerUnit: z.number(),
  wastePercent: z.number(),
  // Цена материала на момент снимка и её валюта. null, когда закупок этого
  // материала ещё не было или валюта в закупке не указана — подставлять
  // ноль или угадывать валюту нельзя (принцип 21: не смешивать контуры).
  lastPurchasePrice: z.number().nullable(),
  priceCurrency: z.string().nullable(),
});
export type ProductionOrderMaterialNorm = z.infer<typeof productionOrderMaterialNormSchema>;

export const productionOrderCostSnapshotSchema = z.object({
  capturedAt: z.string(),
  fabricCostPerUnit: z.number(),
  trimCostPerUnit: z.number(),
  packagingCostPerUnit: z.number(),
  sewingCostPerUnit: z.number(),
  otherCostPerUnit: z.number(),
  actualCostPerUnit: z.number(),
  deductionPerUnit: z.number(),
  specificationPricePerUnit: z.number(),
  materialsWithoutPriceHistory: z.array(z.string()),
  paymentTerms: z.string(),
  deliveryMethod: z.string(),
  contractNumber: z.string(),
  contractDate: z.string(),
  contractorName: z.string(),
  customerName: z.string(),
  contractorSignerRole: z.string(),
  contractorSignerName: z.string(),
  customerSignerName: z.string(),
  // Нормы расхода и версия, по которой они взяты (Pilot v1, этап 4).
  // Необязательны: у партий, подтверждённых раньше, этих полей нет, и
  // интерфейс честно показывает, что нормы для них не сохранялись.
  materialNormsVersion: z.number().optional(),
  materialNorms: z.array(productionOrderMaterialNormSchema).optional(),
  // Согласованная цена пошива и её валюта (Pilot v1, этап P1-1,
  // 2026-09-05) — дублируют production_orders.agreed_unit_price на момент
  // подтверждения, чтобы снимок оставался самодостаточным историческим
  // документом (не требовал обращения к родительскому заказу, чтобы понять,
  // на каких коммерческих условиях он был посчитан). Валюта — не выбор
  // пользователя, а зафиксированное правило бизнеса (RUB — пошив и
  // спецификация, см. docs/PRINCIPLES.md, принцип 21); хранится явно, а не
  // выводится, чтобы будущий код не унаследовал вопрос "а в чём это число"
  // молча. Необязательны по той же причине, что и materialNorms выше —
  // у партий, подтверждённых до этого этапа, их нет.
  agreedUnitPrice: z.number().optional(),
  agreedUnitPriceCurrency: z.literal("RUB").optional(),
});
export type ProductionOrderCostSnapshot = z.infer<typeof productionOrderCostSnapshotSchema>;

export const productionOrderResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  productId: z.string().uuid(),
  bomId: z.string().uuid(),
  workshopId: z.string().uuid(),
  plannedQuantity: z.string(),
  agreedUnitPrice: z.string(),
  materialsProvidedByUs: z.boolean(),
  status: productionOrderStatusSchema,
  dueDate: z.string().nullable(),
  receivedAt: z.date().nullable(),
  costSnapshot: productionOrderCostSnapshotSchema.nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  variants: z.array(productionOrderVariantResponseSchema),
});
export type ProductionOrderResponseDto = z.infer<typeof productionOrderResponseSchema>;

// Предпросмотр матрицы размер × цвет до сохранения заказа (владелец проекта,
// 2026-08-30). Считается на сервере, а не на клиенте: округление по методу
// наибольших остатков должно быть одним и тем же, иначе показанная матрица
// разойдётся с сохранённой.
export const previewProductionOrderVariantsSchema = z.object({
  productId: z.string().uuid(),
  colors: z
    .array(
      z.object({
        color: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Укажите хотя бы один цвет с количеством"),
});
export type PreviewProductionOrderVariantsDto = z.infer<typeof previewProductionOrderVariantsSchema>;

export const productionOrderVariantPreviewRowSchema = z.object({
  productVariantId: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  quantity: z.number().int(),
});

export const previewProductionOrderVariantsResponseSchema = z.object({
  rows: z.array(productionOrderVariantPreviewRowSchema),
  totalQuantity: z.number().int(),
  // Размеры модели, у которых нет варианта под выбранный цвет — показываются
  // честно, а не выкидываются молча.
  missingVariants: z.array(z.object({ size: z.string(), color: z.string() })),
  // true — у модели не задана раскладка, количества делятся поровну.
  usedFallbackRatio: z.boolean(),
});
export type PreviewProductionOrderVariantsResponseDto = z.infer<
  typeof previewProductionOrderVariantsResponseSchema
>;
