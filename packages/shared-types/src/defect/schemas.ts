import { z } from "zod";

// Контракты структурированного брака и компенсации (ПРОМПТ №10.1/10.2,
// этап B, владелец проекта, 2026-09-15). Дефект создаётся автоматически
// вместе с результатом ОТК (см. recordQcResultSchema.defectBreakdown в
// ./qc/schemas.ts) — отдельного публичного "создать дефект" эндпоинта нет.
// Компенсация — единственное действие, требующее явного вызова пользователем.

export const defectBreakdownRowSchema = z.object({
  productVariantId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
  reason: z.string().nullable().optional(),
});
export type DefectBreakdownRowDto = z.infer<typeof defectBreakdownRowSchema>;

export const productionOrderDefectResponseSchema = z.object({
  id: z.string().uuid(),
  productionOrderId: z.string().uuid(),
  qcResultId: z.string().uuid().nullable(),
  productVariantId: z.string().uuid().nullable(),
  quantity: z.number(),
  reason: z.string().nullable(),
  compensatedQuantity: z.number(),
  remainingQuantity: z.number(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProductionOrderDefectResponseDto = z.infer<typeof productionOrderDefectResponseSchema>;

export const productionOrderDefectSummaryResponseSchema = z.object({
  producedQuantity: z.number(),
  defectQuantity: z.number(),
  compensatedQuantity: z.number(),
  remainingToCompensate: z.number(),
});
export type ProductionOrderDefectSummaryResponseDto = z.infer<typeof productionOrderDefectSummaryResponseSchema>;

// Явное подтверждение компенсации (владелец проекта, п.3): пользователь
// сам называет дефект и компенсирующий заказ/строку — сервер не подбирает
// их по sourceProductionOrderId/variantType самостоятельно.
export const createDefectCompensationSchema = z.object({
  compensatingProductionOrderId: z.string().uuid(),
  compensatingVariantId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive(),
});
export type CreateDefectCompensationDto = z.infer<typeof createDefectCompensationSchema>;

export const defectCompensationResponseSchema = z.object({
  id: z.string().uuid(),
  defectId: z.string().uuid(),
  compensatingProductionOrderId: z.string().uuid(),
  compensatingVariantId: z.string().uuid().nullable(),
  quantity: z.number(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
});
export type DefectCompensationResponseDto = z.infer<typeof defectCompensationResponseSchema>;
