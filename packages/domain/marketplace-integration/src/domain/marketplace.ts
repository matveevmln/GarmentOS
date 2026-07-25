export type MarketplaceCode = "wildberries" | "ozon" | "yandex_market";

// Глобальный справочник маркетплейсов (без company_id — docs/DATABASE_SCHEMA.md,
// раздел 12) — одна строка на площадку для всех компаний, не создаётся
// пользователем, только идемпотентно "гарантируется" (ensureMarketplace).
export interface Marketplace {
  id: string;
  code: MarketplaceCode;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
