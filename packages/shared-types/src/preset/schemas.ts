import { z } from "zod";

// Сохраняемые числовые значения (ПРОМПТ №3, раздел 5) — "стоимость пошива" и
// "цена спецификации" — два независимых набора, никогда не смешиваются
// (kind разделяет их жёстко на уровне каждого запроса).
export const numericValuePresetKindSchema = z.enum(["sewing_cost", "specification_price"]);
export type NumericValuePresetKind = z.infer<typeof numericValuePresetKindSchema>;

export const createPresetSchema = z.object({
  kind: numericValuePresetKindSchema,
  value: z.number().positive("Значение пресета должно быть положительным"),
  currency: z.string().min(1, "Валюта не может быть пустой"),
});
export type CreatePresetDto = z.infer<typeof createPresetSchema>;

export const listPresetsQuerySchema = z.object({
  kind: numericValuePresetKindSchema,
});
export type ListPresetsQueryDto = z.infer<typeof listPresetsQuerySchema>;

export const presetResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  kind: numericValuePresetKindSchema,
  value: z.string(),
  currency: z.string(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
});
export type PresetResponseDto = z.infer<typeof presetResponseSchema>;
