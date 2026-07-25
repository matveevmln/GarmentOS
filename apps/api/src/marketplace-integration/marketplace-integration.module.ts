import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  DrizzleMarketplaceAccountRepository,
  DrizzleMarketplaceListingRepository,
  DrizzleMarketplaceRepository,
  DrizzleSyncLogRepository,
} from "@garmentos/domain-marketplace-integration";
import { DATABASE_CONNECTION } from "../database/database.module";
import { MarketplacesController } from "./marketplaces.controller";
import { MarketplaceAccountsController } from "./marketplace-accounts.controller";
import { MarketplaceListingsController } from "./marketplace-listings.controller";
import { SyncLogsController } from "./sync-logs.controller";
import {
  MARKETPLACE_ACCOUNT_REPOSITORY,
  MARKETPLACE_LISTING_REPOSITORY,
  MARKETPLACE_REPOSITORY,
  SYNC_LOG_REPOSITORY,
} from "./marketplace-integration.tokens";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

@Module({
  controllers: [
    MarketplacesController,
    MarketplaceAccountsController,
    MarketplaceListingsController,
    SyncLogsController,
  ],
  providers: [
    MarketplaceIntegrationService,
    {
      provide: MARKETPLACE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleMarketplaceRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: MARKETPLACE_ACCOUNT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleMarketplaceAccountRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: MARKETPLACE_LISTING_REPOSITORY,
      useFactory: (db: Database) => new DrizzleMarketplaceListingRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: SYNC_LOG_REPOSITORY,
      useFactory: (db: Database) => new DrizzleSyncLogRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class MarketplaceIntegrationModule {}
