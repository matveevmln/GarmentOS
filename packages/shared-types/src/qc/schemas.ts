import { z } from "zod";

// Контракты модуля ОТК (владелец проекта, 2026-09-06, P4). Результат
// приёмочного контроля партии — отдельный бизнес-результат, не статус
// заказа: production_order_status этой записью не меняется.

export const recordQcResultSchema = z.object({
  receivedQuantity: z.number().min(0),
  goodQuantity: z.number().min(0),
  defectQuantity: z.number().min(0),
  comment: z.string().nullable().optional(),
});
export type RecordQcResultDto = z.infer<typeof recordQcResultSchema>;

export const qcResultResponseSchema = z.object({
  id: z.string().uuid(),
  productionOrderId: z.string().uuid(),
  receivedQuantity: z.number(),
  goodQuantity: z.number(),
  defectQuantity: z.number(),
  comment: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type QcResultResponseDto = z.infer<typeof qcResultResponseSchema>;
