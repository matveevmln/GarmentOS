import type { Marketplace, MarketplaceCode } from "../domain/marketplace";
import type { MarketplaceRepository } from "./ports";

export interface EnsureMarketplaceInput {
  code: MarketplaceCode;
  name: string;
}

export interface EnsureMarketplaceDeps {
  marketplaces: MarketplaceRepository;
}

// Идемпотентно гарантирует наличие строки справочника маркетплейсов (нет
// company_id — общий для всех компаний, docs/DATABASE_SCHEMA.md, раздел 12).
// Не создание "с нуля" пользователем — это сид-операция, безопасная для
// повторного вызова (например, при старте приложения или миграции seed-данных).
export async function ensureMarketplace(deps: EnsureMarketplaceDeps, input: EnsureMarketplaceInput): Promise<Marketplace> {
  const existing = await deps.marketplaces.findByCode(input.code);
  if (existing) return existing;

  return deps.marketplaces.create(input.code, input.name);
}
