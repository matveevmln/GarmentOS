import { z } from "zod";

// Контракты модуля Раскрой (владелец проекта, 2026-08-30).
// Раскройное задание строится автоматически из данных заказа; вручную
// приходят только исполнитель, комментарий, «выделено» и факт.

export const cuttingOrderStatusSchema = z.enum(["draft", "issued", "completed", "cancelled"]);
export type CuttingOrderStatus = z.infer<typeof cuttingOrderStatusSchema>;

export const cuttingExecutorTypeSchema = z.enum(["in_house", "workshop"]);
export type CuttingExecutorType = z.infer<typeof cuttingExecutorTypeSchema>;

export const createCuttingOrderSchema = z
  .object({
    executorType: cuttingExecutorTypeSchema.optional(),
    executorWorkshopId: z.string().uuid().nullable().optional(),
    comment: z.string().nullable().optional(),
  })
  .refine(
    (value) => value.executorType !== "workshop" || Boolean(value.executorWorkshopId),
    { message: "Для раскроя у подрядчика нужно указать цех", path: ["executorWorkshopId"] },
  );
export type CreateCuttingOrderDto = z.infer<typeof createCuttingOrderSchema>;

export const cuttingAllocationSchema = z.object({
  materialId: z.string().uuid(),
  // null — «сколько выделено, ещё не решено»; ноль означал бы «выделено нисколько».
  allocatedQuantity: z.number().min(0).nullable(),
  rollNote: z.string().nullable().optional(),
});

export const issueCuttingOrderSchema = z.object({
  allocations: z.array(cuttingAllocationSchema).optional(),
});
export type IssueCuttingOrderDto = z.infer<typeof issueCuttingOrderSchema>;

export const cuttingFactMaterialSchema = z.object({
  materialId: z.string().uuid(),
  consumedQuantity: z.number().min(0),
  rollNote: z.string().nullable().optional(),
});

export const cuttingFactResultSchema = z.object({
  productVariantId: z.string().uuid(),
  // Количество готовых изделий (комплектов), а не деталей: у модели из
  // нескольких материалов результат кроя всё равно один — комплект.
  actualQuantity: z.number().int().min(0),
});

export const cuttingFactSchema = z.object({
  // Склад выбирается явно: существующий авторезолв работает только когда склад
  // у компании ровно один, и молча пропускает списание в остальных случаях.
  warehouseId: z.string().uuid(),
  materials: z.array(cuttingFactMaterialSchema),
  results: z.array(cuttingFactResultSchema),
});
export type CuttingFactDto = z.infer<typeof cuttingFactSchema>;

export const cuttingOrderMaterialResponseSchema = z.object({
  materialId: z.string().uuid(),
  materialName: z.string(),
  unit: z.string(),
  requiredQuantity: z.number(),
  allocatedQuantity: z.number().nullable(),
  consumedQuantity: z.number().nullable(),
  rollNote: z.string().nullable(),
});

export const cuttingOrderResultResponseSchema = z.object({
  productVariantId: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  plannedQuantity: z.number(),
  actualQuantity: z.number().nullable(),
});

// Расхождение с учётом: материала не хватало на складе, но факт кроя сохранён
// (владелец проекта, 2026-08-30). Показывается предупреждением, ничего не
// блокирует.
export const cuttingStockShortageSchema = z.object({
  materialId: z.string().uuid(),
  materialName: z.string(),
  onHandBefore: z.number(),
  consumed: z.number(),
  shortage: z.number(),
});

export const cuttingOrderResponseSchema = z.object({
  id: z.string().uuid(),
  productionOrderId: z.string().uuid(),
  number: z.number().int(),
  status: cuttingOrderStatusSchema,
  executorType: cuttingExecutorTypeSchema,
  executorWorkshopId: z.string().uuid().nullable(),
  executorWorkshopName: z.string().nullable(),
  issuedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  comment: z.string().nullable(),
  createdAt: z.date(),
  materials: z.array(cuttingOrderMaterialResponseSchema),
  results: z.array(cuttingOrderResultResponseSchema),
});
export type CuttingOrderResponseDto = z.infer<typeof cuttingOrderResponseSchema>;

export const cuttingFactResponseSchema = z.object({
  cuttingOrder: cuttingOrderResponseSchema,
  shortages: z.array(cuttingStockShortageSchema),
});
export type CuttingFactResponseDto = z.infer<typeof cuttingFactResponseSchema>;
