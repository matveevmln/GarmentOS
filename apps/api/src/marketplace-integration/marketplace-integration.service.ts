import { Inject, Injectable } from "@nestjs/common";
import {
  activateMarketplaceAccount,
  createMarketplaceAccount,
  createMarketplaceListing,
  deactivateMarketplaceAccount,
  ensureMarketplace,
  recordSyncLog,
  updateListingPrice,
  updateListingStock,
  type Marketplace,
  type MarketplaceAccount,
  type MarketplaceAccountRepository,
  type MarketplaceListing,
  type MarketplaceListingRepository,
  type MarketplaceRepository,
  type MarketplaceSyncLog,
  type SyncLogRepository,
} from "@garmentos/domain-marketplace-integration";
import type {
  CreateMarketplaceAccountDto,
  CreateMarketplaceListingDto,
  EnsureMarketplaceDto,
  RecordSyncLogDto,
  UpdateListingPriceDto,
  UpdateListingStockDto,
} from "@garmentos/shared-types";
import {
  MARKETPLACE_ACCOUNT_REPOSITORY,
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_REPOSITORY,
  SYNC_LOG_REPOSITORY,
} from "./marketplace-integration.tokens";

// Тонкий presentation-адаптер поверх packages/domain/marketplace-integration
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в остальных модулях.
@Injectable()
export class MarketplaceIntegrationService {
  constructor(
    @Inject(MARKETPLACE_REPOSITORY) private readonly marketplaces: MarketplaceRepository,
    @Inject(MARKETPLACE_ACCOUNT_REPOSITORY) private readonly marketplaceAccounts: MarketplaceAccountRepository,
    @Inject(MARKETPLACE_LISTING_REPOSITORY) private readonly marketplaceListings: MarketplaceListingRepository,
    @Inject(SYNC_LOG_REPOSITORY) private readonly syncLogs: SyncLogRepository,
  ) {}

  async ensureMarketplace(input: EnsureMarketplaceDto): Promise<Marketplace> {
    return ensureMarketplace({ marketplaces: this.marketplaces }, input);
  }

  async createMarketplaceAccount(companyId: string, input: CreateMarketplaceAccountDto): Promise<MarketplaceAccount> {
    return createMarketplaceAccount(
      { marketplaceAccounts: this.marketplaceAccounts, marketplaces: this.marketplaces },
      { ...input, companyId },
    );
  }

  async activateMarketplaceAccount(companyId: string, marketplaceAccountId: string): Promise<MarketplaceAccount> {
    return activateMarketplaceAccount({ marketplaceAccounts: this.marketplaceAccounts }, { companyId, marketplaceAccountId });
  }

  async deactivateMarketplaceAccount(companyId: string, marketplaceAccountId: string): Promise<MarketplaceAccount> {
    return deactivateMarketplaceAccount({ marketplaceAccounts: this.marketplaceAccounts }, { companyId, marketplaceAccountId });
  }

  async createMarketplaceListing(companyId: string, input: CreateMarketplaceListingDto): Promise<MarketplaceListing> {
    return createMarketplaceListing(
      { marketplaceListings: this.marketplaceListings, marketplaceAccounts: this.marketplaceAccounts },
      { ...input, companyId },
    );
  }

  async updateListingPrice(listingId: string, input: UpdateListingPriceDto): Promise<MarketplaceListing> {
    return updateListingPrice({ marketplaceListings: this.marketplaceListings }, { listingId, ...input });
  }

  async updateListingStock(listingId: string, input: UpdateListingStockDto): Promise<MarketplaceListing> {
    return updateListingStock({ marketplaceListings: this.marketplaceListings }, { listingId, ...input });
  }

  async recordSyncLog(input: RecordSyncLogDto): Promise<MarketplaceSyncLog> {
    // startedAt/finishedAt — ISO-строки в DTO (Swagger/zod v4 не представляют
    // Date в JSON Schema), домен ожидает Date — приведение на границе.
    return recordSyncLog(
      { syncLogs: this.syncLogs },
      {
        ...input,
        startedAt: new Date(input.startedAt),
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : undefined,
      },
    );
  }
}
