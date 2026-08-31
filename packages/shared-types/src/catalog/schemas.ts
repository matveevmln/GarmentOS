import { z } from "zod";

// Контракты модуля Catalog (docs/ARCHITECTURE.md, раздел 3; CLAUDE.md,
// глоссарий: collection/product/sku).

// companyId — из аутентифицированного принципала (@CurrentUser()), не тела
// запроса (docs/AUTH_ARCHITECTURE.md, раздел 8).
export const createCollectionSchema = z.object({
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
  // Плановые составляющие себестоимости, не выводимые из BOM
  // (docs/PRODUCT_MODEL_ARCHITECTURE.md, раздел 6) — прямой ввод.
  standardSewingCost: z.string().nullable(),
  otherProductionCost: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type ProductResponseDto = z.infer<typeof productResponseSchema>;

// Обновление плановых составляющих себестоимости — отдельно от создания
// модели (владелец проекта, 2026-08-03 — «Расчёт стоимости спецификации»).
export const updateProductCostsSchema = z.object({
  standardSewingCost: z.number().min(0).optional(),
  otherProductionCost: z.number().min(0).optional(),
});
export type UpdateProductCostsDto = z.infer<typeof updateProductCostsSchema>;

// name опционален (Итерация 11): без него — список всех моделей компании
// (apps/web), с ним — точный поиск для AI-разбора текстового запроса
// (Итерация 7, docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md).
export const findProductByNameQuerySchema = z.object({
  name: z.string().min(1, "Название модели не может быть пустым").optional(),
});
export type FindProductByNameQueryDto = z.infer<typeof findProductByNameQuerySchema>;

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

export const listProductVariantsQuerySchema = z.object({
  productId: z.string().uuid(),
});
export type ListProductVariantsQueryDto = z.infer<typeof listProductVariantsQuerySchema>;

// Размерный ряд модели: порядок размеров и веса раскладки (владелец проекта,
// 2026-08-30). Веса — рабочие числа («185 / 381 / 381 / 381 / 186»), а не
// проценты: сумма ничему не обязана равняться, важны только соотношения.
export const productSizeSchema = z.object({
  size: z.string().min(1, "Название размера не может быть пустым"),
  ratioWeight: z.number().positive("Вес размера должен быть положительным"),
});
export type ProductSizeDto = z.infer<typeof productSizeSchema>;

// Ряд заменяется целиком одной операцией: порядок и веса меняются вместе, и
// частичное обновление оставило бы ряд в противоречивом состоянии.
export const replaceProductSizesSchema = z.object({
  sizes: z.array(productSizeSchema).min(1, "Размерный ряд должен содержать хотя бы один размер"),
});
export type ReplaceProductSizesDto = z.infer<typeof replaceProductSizesSchema>;

export const productSizeResponseSchema = z.object({
  size: z.string(),
  sortOrder: z.number().int(),
  ratioWeight: z.number(),
});
export type ProductSizeResponseDto = z.infer<typeof productSizeResponseSchema>;

// Добавление цвета создаёт варианты сразу на все размеры ряда — иначе сетка
// 5 размеров × 3 цвета требует пятнадцати ручных операций.
export const addProductColorSchema = z.object({
  color: z.string().min(1, "Название цвета не может быть пустым"),
  // Код цвета вводит человек: транслитерация «Петроль» → «PETROL» машиной
  // была бы угадыванием, а артикул попадает в документы.
  colorCode: z.string().min(1, "Код цвета нужен для артикула"),
});
export type AddProductColorDto = z.infer<typeof addProductColorSchema>;
