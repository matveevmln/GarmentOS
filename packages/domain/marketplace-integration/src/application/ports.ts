import type { Marketplace, MarketplaceCode } from "../domain/marketplace";
import type { MarketplaceAccount } from "../domain/marketplace-account";
import type { MarketplaceListing } from "../domain/marketplace-listing";
import type { MarketplaceSyncLog, SyncStatus } from "../domain/sync-log";

export interface MarketplaceRepository {
  findByCode(code: MarketplaceCode): Promise<Marketplace | null>;
  create(code: MarketplaceCode, name: string): Promise<Marketplace>;
}

export interface NewMarketplaceAccountInput {
  companyId: string;
  marketplaceId: string;
  apiCredentialsEncrypted: string;
}

export interface MarketplaceAccountRepository {
  create(input: NewMarketplaceAccountInput): Promise<MarketplaceAccount>;
  findById(companyId: string, id: string): Promise<MarketplaceAccount | null>;
  setActive(id: string, isActive: boolean): Promise<MarketplaceAccount>;
}

export interface NewMarketplaceListingInput {
  marketplaceAccountId: string;
  productVariantId: string;
  externalSkuId: string;
  currentPrice: number | null;
  currentStockReported: number | null;
}

// У marketplace_listings нет своей колонки company_id — принадлежность
// компании выражена через marketplace_accounts.company_id. companyId в
// findById обязателен и применяется join'ом к аккаунтам: без него цену и
// остаток чужой карточки можно было менять по одному UUID (Step 4A.2).
export interface MarketplaceListingRepository {
  create(input: NewMarketplaceListingInput): Promise<MarketplaceListing>;
  findById(companyId: string, id: string): Promise<MarketplaceListing | null>;
  findByAccountAndExternalSkuId(marketplaceAccountId: string, externalSkuId: string): Promise<MarketplaceListing | null>;
  updatePrice(id: string, currentPrice: number): Promise<MarketplaceListing>;
  updateStock(id: string, currentStockReported: number): Promise<MarketplaceListing>;
}

export interface NewSyncLogInput {
  marketplaceAccountId: string;
  syncType: string;
  status: SyncStatus;
  startedAt: Date;
  finishedAt: Date | null;
  errorDetails: string | null;
}

export interface SyncLogRepository {
  create(input: NewSyncLogInput): Promise<MarketplaceSyncLog>;
}
