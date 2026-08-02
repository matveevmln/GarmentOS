import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  companies,
  createDb,
  marketplaceAccounts,
  marketplaceListings,
  marketplaceSyncLogs,
  productVariants,
  products,
  refreshTokens,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type {
  MarketplaceAccountResponseDto,
  MarketplaceListingResponseDto,
  MarketplaceResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  SyncLogResponseDto,
} from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

interface ErrorResponseBody {
  statusCode: number;
  code?: string;
  message: string;
}

describe("Marketplace Integration API (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  const createdCompanyNames: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    // marketplaces — глобальный справочник без company_id (идемпотентно
    // гарантируется ensureMarketplace) — не принадлежит тестовой компании и
    // намеренно НЕ удаляется здесь, только связанные с тестовой компанией
    // marketplace_accounts/listings/sync_logs.
    for (const name of createdCompanyNames) {
      const [company] = await db.select().from(companies).where(eq(companies.name, name));
      if (company) {
        const accounts = await db
          .select()
          .from(marketplaceAccounts)
          .where(eq(marketplaceAccounts.companyId, company.id));
        for (const account of accounts) {
          await db.delete(marketplaceSyncLogs).where(eq(marketplaceSyncLogs.marketplaceAccountId, account.id));
          await db.delete(marketplaceListings).where(eq(marketplaceListings.marketplaceAccountId, account.id));
        }
        await db.delete(marketplaceAccounts).where(eq(marketplaceAccounts.companyId, company.id));
        const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
        for (const product of companyProducts) {
          await db.delete(productVariants).where(eq(productVariants.productId, product.id));
        }
        await db.delete(products).where(eq(products.companyId, company.id));
        const companyUsers = await db.select().from(users).where(eq(users.companyId, company.id));
        for (const user of companyUsers) {
          await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
          await db.delete(userRoles).where(eq(userRoles.userId, user.id));
        }
        await db.delete(users).where(eq(users.companyId, company.id));
        await db.delete(companies).where(eq(companies.id, company.id));
      }
    }
    await app.close();
  });

  it("гарантирует справочник Wildberries, создаёт личный кабинет, карточку SKU и журнал синхронизации", async () => {
    const companyName = `E2E MarketplaceIntegration ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "marketplace_manager");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Петроль", code: "HOODIE-PETROL-MP-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-MP-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const marketplaceResponse = await request(httpServer)
      .post("/v1/marketplaces/ensure")
      .set(...authHeader(accessToken))
      .send({ code: "wildberries", name: "Wildberries" })
      .expect(201);
    const marketplace = marketplaceResponse.body as MarketplaceResponseDto;

    // Идемпотентность: повторный вызов возвращает ту же строку, не дублирует.
    const marketplaceAgainResponse = await request(httpServer)
      .post("/v1/marketplaces/ensure")
      .set(...authHeader(accessToken))
      .send({ code: "wildberries", name: "Wildberries" })
      .expect(201);
    expect((marketplaceAgainResponse.body as MarketplaceResponseDto).id).toBe(marketplace.id);

    const accountResponse = await request(httpServer)
      .post("/v1/marketplace-accounts")
      .set(...authHeader(accessToken))
      .send({ marketplaceCode: "wildberries", apiCredentialsEncrypted: "encrypted-token" })
      .expect(201);
    const account = accountResponse.body as MarketplaceAccountResponseDto;
    expect(account.isActive).toBe(true);

    const deactivatedResponse = await request(httpServer)
      .post(`/v1/marketplace-accounts/${account.id}/deactivate`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((deactivatedResponse.body as MarketplaceAccountResponseDto).isActive).toBe(false);

    const reactivatedResponse = await request(httpServer)
      .post(`/v1/marketplace-accounts/${account.id}/activate`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((reactivatedResponse.body as MarketplaceAccountResponseDto).isActive).toBe(true);

    const listingResponse = await request(httpServer)
      .post("/v1/marketplace-listings")
      .set(...authHeader(accessToken))
      .send({
        marketplaceAccountId: account.id,
        productVariantId: variant.id,
        externalSkuId: "WB-12345",
        currentPrice: 3500,
        currentStockReported: 10,
      })
      .expect(201);
    const listing = listingResponse.body as MarketplaceListingResponseDto;

    const duplicateListingResponse = await request(httpServer)
      .post("/v1/marketplace-listings")
      .set(...authHeader(accessToken))
      .send({
        marketplaceAccountId: account.id,
        productVariantId: variant.id,
        externalSkuId: "WB-12345",
      })
      .expect(409);
    expect((duplicateListingResponse.body as ErrorResponseBody).code).toBe("LISTING_EXTERNAL_SKU_ID_TAKEN");

    const priceUpdatedResponse = await request(httpServer)
      .post(`/v1/marketplace-listings/${listing.id}/price`)
      .set(...authHeader(accessToken))
      .send({ currentPrice: 3300 })
      .expect(201);
    expect((priceUpdatedResponse.body as MarketplaceListingResponseDto).currentPrice).toBe("3300.00");

    const stockUpdatedResponse = await request(httpServer)
      .post(`/v1/marketplace-listings/${listing.id}/stock`)
      .set(...authHeader(accessToken))
      .send({ currentStockReported: 8 })
      .expect(201);
    expect((stockUpdatedResponse.body as MarketplaceListingResponseDto).currentStockReported).toBe("8.000");

    const syncLogResponse = await request(httpServer)
      .post("/v1/sync-logs")
      .set(...authHeader(accessToken))
      .send({
        marketplaceAccountId: account.id,
        syncType: "stock_price",
        status: "success",
        startedAt: new Date().toISOString(),
      })
      .expect(201);
    expect((syncLogResponse.body as SyncLogResponseDto).status).toBe("success");
  });

  it("warehouse_keeper без marketplace_integration.write не может создать личный кабинет — 403", async () => {
    const companyName = `E2E MarketplaceIntegration Forbidden ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "warehouse_keeper");

    await request(httpServer)
      .post("/v1/marketplace-accounts")
      .set(...authHeader(accessToken))
      .send({ marketplaceCode: "wildberries", apiCredentialsEncrypted: "encrypted-token" })
      .expect(403);
  });
});
