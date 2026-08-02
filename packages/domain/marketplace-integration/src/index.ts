// Публичный интерфейс модуля Marketplace Integration (docs/REPOSITORY_STRUCTURE.md).

export type { Marketplace, MarketplaceCode } from "./domain/marketplace";
export type { MarketplaceAccount } from "./domain/marketplace-account";
export type { MarketplaceListing } from "./domain/marketplace-listing";
export type { MarketplaceSyncLog, SyncStatus } from "./domain/sync-log";
export { DomainError } from "./domain/errors";

export type {
  MarketplaceAccountRepository,
  MarketplaceListingRepository,
  MarketplaceRepository,
  NewMarketplaceAccountInput,
  NewMarketplaceListingInput,
  NewSyncLogInput,
  SyncLogRepository,
} from "./application/ports";

export { ensureMarketplace, type EnsureMarketplaceDeps, type EnsureMarketplaceInput } from "./application/ensure-marketplace";
export {
  createMarketplaceAccount,
  type CreateMarketplaceAccountDeps,
  type CreateMarketplaceAccountInput,
} from "./application/create-marketplace-account";
export {
  activateMarketplaceAccount,
  deactivateMarketplaceAccount,
  type ToggleMarketplaceAccountDeps,
  type ToggleMarketplaceAccountInput,
} from "./application/toggle-marketplace-account";
export {
  createMarketplaceListing,
  type CreateMarketplaceListingDeps,
  type CreateMarketplaceListingInput,
} from "./application/create-marketplace-listing";
export { updateListingPrice, updateListingStock, type UpdateListingDeps } from "./application/update-listing";
export { recordSyncLog, type RecordSyncLogDeps, type RecordSyncLogInput } from "./application/record-sync-log";

export {
  DrizzleMarketplaceAccountRepository,
  DrizzleMarketplaceListingRepository,
  DrizzleMarketplaceRepository,
  DrizzleSyncLogRepository,
} from "./infrastructure/drizzle-marketplace-repository";
