import { z } from "zod";

// Контракты модуля BOM (docs/ARCHITECTURE.md, раздел 3; CLAUDE.md,
// глоссарий: bom — спецификация, нормы расхода материалов на единицу модели).

export const bomStatusSchema = z.enum(["draft", "approved", "archived"]);

export const bomItemDraftSchema = z.object({
  materialId: z.string().uuid(),
  quantityPerUnit: z.number().positive(),
  wastePercent: z.number().min(0).optional(),
});

export const createBomDraftSchema = z.object({
  productId: z.string().uuid(),
  items: z.array(bomItemDraftSchema).min(1, "Спецификация (BOM) должна содержать хотя бы один материал"),
  createdBy: z.string().uuid().optional(),
});
export type CreateBomDraftDto = z.infer<typeof createBomDraftSchema>;

export const bomItemResponseSchema = z.object({
  id: z.string().uuid(),
  bomId: z.string().uuid(),
  materialId: z.string().uuid(),
  quantityPerUnit: z.string(),
  wastePercent: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const bomResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  productId: z.string().uuid(),
  version: z.number().int(),
  status: bomStatusSchema,
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(bomItemResponseSchema),
});
export type BomResponseDto = z.infer<typeof bomResponseSchema>;

export const getApprovedBomQuerySchema = z.object({
  productId: z.string().uuid(),
});
export type GetApprovedBomQueryDto = z.infer<typeof getApprovedBomQuerySchema>;
