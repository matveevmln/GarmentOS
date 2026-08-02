import {
  boolean,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";
import { companies } from "./identity";
import { productVariants } from "./catalog";

// docs/DATABASE_SCHEMA.md, раздел 12 (Marketplace Integration).
// Домен работает только с интерфейсом MarketplaceConnector
// (docs/ARCHITECTURE.md, п.5.1) — эти таблицы хранят состояние, не логику.

export const marketplaceCodeEnum = pgEnum("marketplace_code", [
  "wildberries",
  "ozon",
  "yandex_market",
]);

export const syncStatusEnum = pgEnum("sync_status", ["success", "partial", "failed"]);

export const marketplaces = pgTable("marketplaces", {
  id: id(),
  code: marketplaceCodeEnum("code").notNull().unique(),
  name: text("name").notNull(),
  ...auditColumns,
});

export const marketplaceAccounts = pgTable("marketplace_accounts", {
  id: id(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companies.id),
  marketplaceId: uuid("marketplace_id")
    .notNull()
    .references(() => marketplaces.id),
  // Зашифровано на уровне приложения (docs/QUALITY_STANDARDS.md, раздел 6).
  apiCredentialsEncrypted: text("api_credentials_encrypted").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...auditColumns,
});

export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: id(),
    marketplaceAccountId: uuid("marketplace_account_id")
      .notNull()
      .references(() => marketplaceAccounts.id),
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id),
    externalSkuId: text("external_sku_id").notNull(),
    currentPrice: numeric("current_price", { precision: 14, scale: 2 }),
    currentStockReported: numeric("current_stock_reported", { precision: 12, scale: 3 }),
    ...auditColumns,
  },
  (table) => [
    uniqueIndex("marketplace_listings_account_sku_idx").on(
      table.marketplaceAccountId,
      table.externalSkuId,
    ),
  ],
);

export const marketplaceSyncLogs = pgTable("marketplace_sync_logs", {
  id: id(),
  marketplaceAccountId: uuid("marketplace_account_id")
    .notNull()
    .references(() => marketplaceAccounts.id),
  syncType: text("sync_type").notNull(),
  status: syncStatusEnum("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  errorDetails: text("error_details"),
  ...auditColumns,
});
