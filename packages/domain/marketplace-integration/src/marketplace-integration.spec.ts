import { config } from "dotenv";

config({ path: "../../../.env" });

import {
  createCollection,
  createProduct,
  createProductVariant,
  DrizzleCollectionRepository,
  DrizzleProductRepository,
  DrizzleProductVariantRepository,
} from "@garmentos/domain-catalog";
import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, DrizzleCompanyRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { createMarketplaceAccount } from "./application/create-marketplace-account";
import { createMarketplaceListing } from "./application/create-marketplace-listing";
import { ensureMarketplace } from "./application/ensure-marketplace";
import { recordSyncLog } from "./application/record-sync-log";
import { deactivateMarketplaceAccount } from "./application/toggle-marketplace-account";
import { updateListingPrice, updateListingStock } from "./application/update-listing";
import { DomainError } from "./domain/errors";
import {
  DrizzleMarketplaceAccountRepository,
  DrizzleMarketplaceListingRepository,
  DrizzleMarketplaceRepository,
  DrizzleSyncLogRepository,
} from "./infrastructure/drizzle-marketplace-repository";

class RollbackTestTransaction extends Error {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

async function runInRolledBackTransaction(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new RollbackTestTransaction();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollbackTestTransaction)) throw error;
    });
}

async function seedVariant(tx: DbOrTx) {
  const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд маркетплейса" });
  const collections = new DrizzleCollectionRepository(tx);
  const collection = await createCollection({ collections }, { companyId: company.id, name: "Осень 2026" });
  const products = new DrizzleProductRepository(tx);
  const product = await createProduct(
    { products },
    { companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL" },
  );
  const productVariants = new DrizzleProductVariantRepository(tx);
  const variant = await createProductVariant(
    { productVariants },
    { productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-M" },
  );
  return { company, variant };
}

describe("domain/marketplace-integration", () => {
  it("подключает Wildberries, создаёт карточку SKU, обновляет цену/остаток и пишет журнал синхронизации", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company, variant } = await seedVariant(tx);

      const marketplaces = new DrizzleMarketplaceRepository(tx);
      const wildberries = await ensureMarketplace({ marketplaces }, { code: "wildberries", name: "Wildberries" });
      // Повторный вызов идемпотентен — не создаёт вторую строку.
      const again = await ensureMarketplace({ marketplaces }, { code: "wildberries", name: "Wildberries" });
      expect(again.id).toBe(wildberries.id);

      const marketplaceAccounts = new DrizzleMarketplaceAccountRepository(tx);
      const account = await createMarketplaceAccount(
        { marketplaceAccounts, marketplaces },
        { companyId: company.id, marketplaceCode: "wildberries", apiCredentialsEncrypted: "encrypted-token" },
      );
      expect(account.isActive).toBe(true);

      const marketplaceListings = new DrizzleMarketplaceListingRepository(tx);
      const listing = await createMarketplaceListing(
        { marketplaceListings, marketplaceAccounts },
        {
          companyId: company.id,
          marketplaceAccountId: account.id,
          productVariantId: variant.id,
          externalSkuId: "WB-SKU-001",
          currentPrice: 2990,
          currentStockReported: 50,
        },
      );

      // Дубликат external SKU в рамках того же кабинета запрещён.
      await expect(
        createMarketplaceListing(
          { marketplaceListings, marketplaceAccounts },
          { companyId: company.id, marketplaceAccountId: account.id, productVariantId: variant.id, externalSkuId: "WB-SKU-001" },
        ),
      ).rejects.toThrow(DomainError);

      const afterPriceUpdate = await updateListingPrice({ marketplaceListings }, { listingId: listing.id, currentPrice: 2790 });
      expect(afterPriceUpdate.currentPrice).toBe("2790.00");

      const afterStockUpdate = await updateListingStock({ marketplaceListings }, { listingId: listing.id, currentStockReported: 45 });
      expect(afterStockUpdate.currentStockReported).toBe("45.000");

      const syncLogs = new DrizzleSyncLogRepository(tx);
      const log = await recordSyncLog(
        { syncLogs },
        { marketplaceAccountId: account.id, syncType: "stock_price_sync", status: "success", startedAt: new Date(), finishedAt: new Date() },
      );
      expect(log.status).toBe("success");

      const deactivated = await deactivateMarketplaceAccount({ marketplaceAccounts }, { companyId: company.id, marketplaceAccountId: account.id });
      expect(deactivated.isActive).toBe(false);
    });
  });

  it("отклоняет создание личного кабинета для незарегистрированного маркетплейса", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const { company } = await seedVariant(tx);
      const marketplaces = new DrizzleMarketplaceRepository(tx);
      const marketplaceAccounts = new DrizzleMarketplaceAccountRepository(tx);

      await expect(
        createMarketplaceAccount(
          { marketplaceAccounts, marketplaces },
          { companyId: company.id, marketplaceCode: "ozon", apiCredentialsEncrypted: "token" },
        ),
      ).rejects.toThrow(/не зарегистрирован/);
    });
  });
});
