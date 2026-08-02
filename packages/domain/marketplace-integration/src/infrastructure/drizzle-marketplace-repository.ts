import {
  marketplaceAccounts,
  marketplaceListings,
  marketplaces,
  marketplaceSyncLogs,
  type DbOrTx,
} from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { Marketplace, MarketplaceCode } from "../domain/marketplace";
import type { MarketplaceAccount } from "../domain/marketplace-account";
import type { MarketplaceListing } from "../domain/marketplace-listing";
import type { MarketplaceSyncLog } from "../domain/sync-log";
import type {
  MarketplaceAccountRepository,
  MarketplaceListingRepository,
  MarketplaceRepository,
  NewMarketplaceAccountInput,
  NewMarketplaceListingInput,
  NewSyncLogInput,
  SyncLogRepository,
} from "../application/ports";

type MarketplaceRow = typeof marketplaces.$inferSelect;
type MarketplaceAccountRow = typeof marketplaceAccounts.$inferSelect;
type MarketplaceListingRow = typeof marketplaceListings.$inferSelect;
type MarketplaceSyncLogRow = typeof marketplaceSyncLogs.$inferSelect;

function toMarketplace(row: MarketplaceRow): Marketplace {
  return { id: row.id, code: row.code, name: row.name, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function toMarketplaceAccount(row: MarketplaceAccountRow): MarketplaceAccount {
  return {
    id: row.id,
    companyId: row.companyId,
    marketplaceId: row.marketplaceId,
    apiCredentialsEncrypted: row.apiCredentialsEncrypted,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMarketplaceListing(row: MarketplaceListingRow): MarketplaceListing {
  return {
    id: row.id,
    marketplaceAccountId: row.marketplaceAccountId,
    productVariantId: row.productVariantId,
    externalSkuId: row.externalSkuId,
    currentPrice: row.currentPrice,
    currentStockReported: row.currentStockReported,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSyncLog(row: MarketplaceSyncLogRow): MarketplaceSyncLog {
  return {
    id: row.id,
    marketplaceAccountId: row.marketplaceAccountId,
    syncType: row.syncType,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    errorDetails: row.errorDetails,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleMarketplaceRepository implements MarketplaceRepository {
  constructor(private readonly db: DbOrTx) {}

  async findByCode(code: MarketplaceCode): Promise<Marketplace | null> {
    const [row] = await this.db.select().from(marketplaces).where(eq(marketplaces.code, code)).limit(1);
    return row ? toMarketplace(row) : null;
  }

  async create(code: MarketplaceCode, name: string): Promise<Marketplace> {
    const [row] = await this.db.insert(marketplaces).values({ code, name }).returning();
    if (!row) throw new Error("INSERT marketplaces не вернул строку");
    return toMarketplace(row);
  }
}

export class DrizzleMarketplaceAccountRepository implements MarketplaceAccountRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewMarketplaceAccountInput): Promise<MarketplaceAccount> {
    const [row] = await this.db.insert(marketplaceAccounts).values(input).returning();
    if (!row) throw new Error("INSERT marketplace_accounts не вернул строку");
    return toMarketplaceAccount(row);
  }

  async findById(companyId: string, id: string): Promise<MarketplaceAccount | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceAccounts)
      .where(and(eq(marketplaceAccounts.companyId, companyId), eq(marketplaceAccounts.id, id)))
      .limit(1);
    return row ? toMarketplaceAccount(row) : null;
  }

  async setActive(id: string, isActive: boolean): Promise<MarketplaceAccount> {
    const [row] = await this.db
      .update(marketplaceAccounts)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(marketplaceAccounts.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE marketplace_accounts не нашёл строку id=${id}`);
    return toMarketplaceAccount(row);
  }
}

export class DrizzleMarketplaceListingRepository implements MarketplaceListingRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewMarketplaceListingInput): Promise<MarketplaceListing> {
    const [row] = await this.db
      .insert(marketplaceListings)
      .values({
        marketplaceAccountId: input.marketplaceAccountId,
        productVariantId: input.productVariantId,
        externalSkuId: input.externalSkuId,
        currentPrice: input.currentPrice !== null ? String(input.currentPrice) : null,
        currentStockReported: input.currentStockReported !== null ? String(input.currentStockReported) : null,
      })
      .returning();
    if (!row) throw new Error("INSERT marketplace_listings не вернул строку");
    return toMarketplaceListing(row);
  }

  async findById(id: string): Promise<MarketplaceListing | null> {
    const [row] = await this.db.select().from(marketplaceListings).where(eq(marketplaceListings.id, id)).limit(1);
    return row ? toMarketplaceListing(row) : null;
  }

  async findByAccountAndExternalSkuId(marketplaceAccountId: string, externalSkuId: string): Promise<MarketplaceListing | null> {
    const [row] = await this.db
      .select()
      .from(marketplaceListings)
      .where(
        and(
          eq(marketplaceListings.marketplaceAccountId, marketplaceAccountId),
          eq(marketplaceListings.externalSkuId, externalSkuId),
        ),
      )
      .limit(1);
    return row ? toMarketplaceListing(row) : null;
  }

  async updatePrice(id: string, currentPrice: number): Promise<MarketplaceListing> {
    const [row] = await this.db
      .update(marketplaceListings)
      .set({ currentPrice: String(currentPrice), updatedAt: new Date() })
      .where(eq(marketplaceListings.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE marketplace_listings не нашёл строку id=${id}`);
    return toMarketplaceListing(row);
  }

  async updateStock(id: string, currentStockReported: number): Promise<MarketplaceListing> {
    const [row] = await this.db
      .update(marketplaceListings)
      .set({ currentStockReported: String(currentStockReported), updatedAt: new Date() })
      .where(eq(marketplaceListings.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE marketplace_listings не нашёл строку id=${id}`);
    return toMarketplaceListing(row);
  }
}

export class DrizzleSyncLogRepository implements SyncLogRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewSyncLogInput): Promise<MarketplaceSyncLog> {
    const [row] = await this.db.insert(marketplaceSyncLogs).values(input).returning();
    if (!row) throw new Error("INSERT marketplace_sync_logs не вернул строку");
    return toSyncLog(row);
  }
}
