import { z } from "zod";

// Контракты модуля Specification (владелец проекта, 2026-09-11 — «Production
// Master»): спецификация — самостоятельная бизнес-сущность, первый шаг
// производства, независимая от production_orders (CLAUDE.md, глоссарий
// расширяется этим модулем: specification — коммерческий документ, который
// утверждается ДО производственной партии; PDF — представление, не
// источник истины).

export const specificationStatusSchema = z.enum(["draft", "approved", "cancelled"]);

export const specificationItemDraftSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});
export type SpecificationItemDraft = z.infer<typeof specificationItemDraftSchema>;

// createdBy сознательно не поле этой схемы — авторство всегда берётся из
// аутентифицированного пользователя (@CurrentUser()), не из тела запроса
// (тот же принцип, что и companyId, docs/AUTH_ARCHITECTURE.md, раздел 8).
export const createSpecificationDraftSchema = z.object({
  workshopId: z.string().uuid(),
  productId: z.string().uuid(),
  deliveryDeadline: z.string().optional(),
  items: z.array(specificationItemDraftSchema).min(1, "Спецификация должна содержать хотя бы одну строку"),
});
export type CreateSpecificationDraftDto = z.infer<typeof createSpecificationDraftSchema>;

// «Создать на основе существующей» (требование №3) — все поля переопределения
// необязательны, по умолчанию копируются 1:1 из источника.
export const createSpecificationFromExistingSchema = z.object({
  sourceSpecificationId: z.string().uuid(),
  overrideWorkshopId: z.string().uuid().optional(),
  overrideProductId: z.string().uuid().optional(),
  overrideDeliveryDeadline: z.string().nullable().optional(),
  overrideItems: z.array(specificationItemDraftSchema).min(1).optional(),
});
export type CreateSpecificationFromExistingDto = z.infer<typeof createSpecificationFromExistingSchema>;

// ПРОМПТ №3, раздел 4 — создание спецификации ИЗ уже существующего заказа
// (production_order_id обязателен, приходит из URL/пути, не из тела — тот же
// принцип, что и companyId). Строки/цех/модель/срок поставки берутся с
// backend из данных заказа, ничего не передаётся в теле запроса — минимум
// кликов (принцип 17): пользователь один раз нажимает «Создать спецификацию».
export const createSpecificationFromProductionOrderSchema = z.object({}).optional();
export type CreateSpecificationFromProductionOrderDto = z.infer<typeof createSpecificationFromProductionOrderSchema>;

// Правка спецификации NEW-потока (ПРОМПТ №3, раздел 4/9) — все поля
// необязательны (PATCH: передано — меняется, не передано — как было).
// productId/productionOrderId не редактируются никогда — смена модели или
// источника оформляется новой спецификацией, не правкой существующей.
export const updateSpecificationSchema = z
  .object({
    workshopId: z.string().uuid().optional(),
    deliveryDeadline: z.string().nullable().optional(),
    items: z.array(specificationItemDraftSchema).min(1, "Спецификация должна содержать хотя бы одну строку").optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Не передано ни одного поля для изменения",
  });
export type UpdateSpecificationDto = z.infer<typeof updateSpecificationSchema>;

export const listSpecificationsQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  workshopId: z.string().uuid().optional(),
  status: specificationStatusSchema.optional(),
  // Спецификация, созданная ИЗ конкретного заказа пошива (NEW-поток,
  // specifications.production_order_id) — нужен фронтенду там, где известен
  // только id заказа, а не id спецификации (владелец проекта, 2026-09-22,
  // тот же either/or, что уже реализован в BatchPassportService.getPassport).
  productionOrderId: z.string().uuid().optional(),
});
export type ListSpecificationsQueryDto = z.infer<typeof listSpecificationsQuerySchema>;

export const specificationItemResponseSchema = z.object({
  id: z.string().uuid(),
  specificationId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.string(),
  unitPrice: z.string(),
  sum: z.string(),
  sortOrder: z.number().int(),
});

// snapshotJson — произвольная (на уровне API) структура: строгая типизация
// живёт в домене (SpecificationSnapshot, @garmentos/domain-specification),
// здесь достаточно, что это объект или null (до утверждения).
// Создание производственной партии из утверждённой спецификации (Этап 3
// «Production Master», владелец проекта, 2026-09-12). `items` необязательны —
// если не переданы, backend берёт ВСЁ доступное (ещё не размещённое в
// партиях) количество по каждой строке спецификации, минимум кликов
// (принцип 17). Если переданы — задают частичный запуск: backend сам
// проверяет, что запрошенное количество не превышает остаток по каждой
// строке (frontend ничего критичного не считает).
export const createProductionOrderFromSpecificationSchema = z.object({
  items: z
    .array(
      z.object({
        productVariantId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .optional(),
});
export type CreateProductionOrderFromSpecificationDto = z.infer<typeof createProductionOrderFromSpecificationSchema>;

// Остаток спецификации (Этап 3) — сколько из каждой строки ещё не размещено
// ни в одной производственной партии. Все расчёты — backend (принцип:
// frontend только отображает результат).
export const specificationAvailableItemSchema = z.object({
  productVariantId: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  unitPrice: z.number(),
  specifiedQuantity: z.number(),
  allocatedQuantity: z.number(),
  availableQuantity: z.number(),
});
export type SpecificationAvailableItemDto = z.infer<typeof specificationAvailableItemSchema>;

export const specificationAvailableQuantityResponseSchema = z.object({
  items: z.array(specificationAvailableItemSchema),
});
export type SpecificationAvailableQuantityResponseDto = z.infer<typeof specificationAvailableQuantityResponseSchema>;

export const specificationResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  workshopId: z.string().uuid(),
  productId: z.string().uuid(),
  // NEW-поток (ПРОМПТ №3) — заказ, ИЗ которого создана эта спецификация;
  // null у legacy-спецификаций (созданных ДО заказа, старым способом).
  productionOrderId: z.string().uuid().nullable(),
  specNumber: z.number().int().nullable(),
  status: specificationStatusSchema,
  version: z.number().int(),
  basedOnSpecificationId: z.string().uuid().nullable(),
  deliveryDeadline: z.string().nullable(),
  totalQuantity: z.string(),
  totalSum: z.string(),
  totalSumCurrency: z.string(),
  prepaymentAmount: z.string().nullable(),
  snapshotJson: z.record(z.string(), z.unknown()).nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(specificationItemResponseSchema),
});
export type SpecificationResponseDto = z.infer<typeof specificationResponseSchema>;
