import { z } from "zod";

// Контракты модуля Marketplace Integration (docs/ARCHITECTURE.md, раздел 3
// и раздел 5.1 — MarketplaceConnector).

export const marketplaceCodeSchema = z.enum(["wildberries", "ozon", "yandex_market"]);

export const ensureMarketplaceSchema = z.object({
  code: marketplaceCodeSchema,
  name: z.string().min(1, "Название маркетплейса не может быть пустым"),
});
export type EnsureMarketplaceDto = z.infer<typeof ensureMarketplaceSchema>;

export const marketplaceResponseSchema = z.object({
  id: z.string().uuid(),
  code: marketplaceCodeSchema,
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MarketplaceResponseDto = z.infer<typeof marketplaceResponseSchema>;

export const createMarketplaceAccountSchema = z.object({
  marketplaceCode: marketplaceCodeSchema,
  apiCredentialsEncrypted: z.string().min(1, "Учётные данные API не могут быть пустыми"),
});
export type CreateMarketplaceAccountDto = z.infer<typeof createMarketplaceAccountSchema>;

export const marketplaceAccountResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  marketplaceId: z.string().uuid(),
  apiCredentialsEncrypted: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MarketplaceAccountResponseDto = z.infer<typeof marketplaceAccountResponseSchema>;

export const createMarketplaceListingSchema = z.object({
  marketplaceAccountId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  externalSkuId: z.string().min(1, "Внешний ID SKU на маркетплейсе не может быть пустым"),
  currentPrice: z.number().min(0).optional(),
  currentStockReported: z.number().min(0).optional(),
});
export type CreateMarketplaceListingDto = z.infer<typeof createMarketplaceListingSchema>;

export const marketplaceListingResponseSchema = z.object({
  id: z.string().uuid(),
  marketplaceAccountId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  externalSkuId: z.string(),
  currentPrice: z.string().nullable(),
  currentStockReported: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type MarketplaceListingResponseDto = z.infer<typeof marketplaceListingResponseSchema>;

export const updateListingPriceSchema = z.object({
  currentPrice: z.number().min(0),
});
export type UpdateListingPriceDto = z.infer<typeof updateListingPriceSchema>;

export const updateListingStockSchema = z.object({
  currentStockReported: z.number().min(0),
});
export type UpdateListingStockDto = z.infer<typeof updateListingStockSchema>;

export const syncStatusSchema = z.enum(["success", "partial", "failed"]);

export const recordSyncLogSchema = z.object({
  marketplaceAccountId: z.string().uuid(),
  syncType: z.string().min(1),
  status: syncStatusSchema,
  // ISO-строки, не z.date() (см. sales/schemas.ts — Swagger/zod v4 ограничение).
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().optional(),
  errorDetails: z.string().optional(),
});
export type RecordSyncLogDto = z.infer<typeof recordSyncLogSchema>;

export const syncLogResponseSchema = z.object({
  id: z.string().uuid(),
  marketplaceAccountId: z.string().uuid(),
  syncType: z.string(),
  status: syncStatusSchema,
  startedAt: z.date(),
  finishedAt: z.date().nullable(),
  errorDetails: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SyncLogResponseDto = z.infer<typeof syncLogResponseSchema>;
