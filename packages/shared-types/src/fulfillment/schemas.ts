import { z } from "zod";

// «Фулфилмент ОТК» (ПРОМПТ №3, раздел 10) — read-model поверх уже
// существующих production_orders/production_order_qc_results/documents, не
// новая сущность. Список партий, отправленных на фулфилмент (status
// shipped_to_fulfillment и позже), с минимальным набором полей: модель,
// фото, номер партии, спецификация, отправлено/принято/брак, статус ОТК.
export const fulfillmentQcStatusSchema = z.enum(["awaiting_qc", "qc_recorded"]);
export type FulfillmentQcStatus = z.infer<typeof fulfillmentQcStatusSchema>;

export const fulfillmentBatchListItemSchema = z.object({
  productionOrderId: z.string().uuid(),
  orderNumber: z.number().int().nullable(),
  status: z.string(),
  productId: z.string().uuid(),
  productName: z.string(),
  productPhotoUrl: z.string().nullable(),
  specificationId: z.string().uuid().nullable(),
  specNumber: z.number().int().nullable(),
  // Отправлено — плановое количество партии (заказ уже дошёл до
  // shipped_to_fulfillment/received/completed). Принято/брак — из ОТК, null
  // до фиксации результата (ПРОМПТ №3: "Завершение заказа не должно
  // происходить автоматически только из-за ввода данных ОТК" — здесь же
  // отражается сам факт, что результат ещё не введён).
  sentQuantity: z.string(),
  receivedQuantity: z.string().nullable(),
  defectQuantity: z.string().nullable(),
  qcStatus: fulfillmentQcStatusSchema,
});
export type FulfillmentBatchListItemDto = z.infer<typeof fulfillmentBatchListItemSchema>;

export const fulfillmentBatchListResponseSchema = z.object({
  items: z.array(fulfillmentBatchListItemSchema),
});
export type FulfillmentBatchListResponseDto = z.infer<typeof fulfillmentBatchListResponseSchema>;
