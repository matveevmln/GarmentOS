import { z } from "zod";

// Контракты узкого сценария Итерации 7 (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md,
// раздел 2) — разбор текстового производственного запроса в объёмы по
// цвету/размеру. Не отдельный доменный bounded context (как и Inbox), поэтому
// схемы лежат тут же, а не в отдельном пакете domain.

export const parseProductionRequestSchema = z.object({
  text: z.string().min(1, "Текст запроса не может быть пустым"),
});
export type ParseProductionRequestDto = z.infer<typeof parseProductionRequestSchema>;

export const parsedProductionRequestItemSchema = z.object({
  colorName: z.string(),
  size: z.string(),
  quantity: z.number(),
});

export const parsedProductionRequestResponseSchema = z.object({
  modelName: z.string(),
  unitPrice: z.number().nullable(),
  items: z.array(parsedProductionRequestItemSchema),
});
export type ParsedProductionRequestResponseDto = z.infer<typeof parsedProductionRequestResponseSchema>;

// workshopId передаётся явно, не резолвится AI из текста — текст сценария
// Итерации 7 не называет цех, а придумывать его AI не имеет права
// (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md, раздел 2, пункт 4).
export const createProductionOrderFromTextSchema = z.object({
  text: z.string().min(1, "Текст запроса не может быть пустым"),
  workshopId: z.string().uuid(),
});
export type CreateProductionOrderFromTextDto = z.infer<typeof createProductionOrderFromTextSchema>;
