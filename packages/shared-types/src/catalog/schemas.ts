import { z } from "zod";

// Контракты модуля Catalog (docs/ARCHITECTURE.md, раздел 3; CLAUDE.md,
// глоссарий: collection/product/sku).

export const createCollectionSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1, "Название коллекции не может быть пустым"),
  season: z.enum(["spring", "summer", "autumn", "winter"]).optional(),
  year: z.number().int().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateCollectionDto = z.infer<typeof createCollectionSchema>;

export const collectionResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  season: z.enum(["spring", "summer", "autumn", "winter"]).nullable(),
  year: z.number().int().nullable(),
  status: z.enum(["planning", "active", "archived"]),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CollectionResponseDto = z.infer<typeof collectionResponseSchema>;

export const createProductSchema = z.object({
  companyId: z.string().uuid(),
  collectionId: z.string().uuid().optional(),
  name: z.string().min(1, "Название модели не может быть пустым"),
  code: z.string().min(1, "Артикул модели не может быть пустым"),
  category: z.string().optional(),
  season: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  collectionId: z.string().uuid().nullable(),
  name: z.string(),
  code: z.string(),
  category: z.string().nullable(),
  season: z.string().nullable(),
  status: z.enum(["draft", "active", "discontinued"]),
  techPackUrl: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type ProductResponseDto = z.infer<typeof productResponseSchema>;

export const createProductVariantSchema = z.object({
  productId: z.string().uuid(),
  size: z.string().min(1, "Размер SKU не может быть пустым"),
  color: z.string().min(1, "Цвет SKU не может быть пустым"),
  skuCode: z.string().min(1, "Код SKU не может быть пустым"),
  barcode: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateProductVariantDto = z.infer<typeof createProductVariantSchema>;

export const productVariantResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  skuCode: z.string(),
  barcode: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type ProductVariantResponseDto = z.infer<typeof productVariantResponseSchema>;
