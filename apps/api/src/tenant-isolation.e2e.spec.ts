import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  companies,
  createDb,
  inventoryCountItems,
  inventoryCounts,
  marketplaceAccounts,
  marketplaceListings,
  marketplaceSyncLogs,
  productVariants,
  products,
  refreshTokens,
  userRoles,
  users,
  warehouses,
} from "@garmentos/db-schema";
import type {
  InventoryCountResponseDto,
  MarketplaceAccountResponseDto,
  MarketplaceListingResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  WarehouseResponseDto,
} from "@garmentos/shared-types";
import { and, eq, inArray, isNull } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { roles } from "@garmentos/db-schema";
import { AppModule } from "./app.module";
import { TokenService } from "./auth/token.service";
import { hashPassword } from "./identity/password-hasher";
import { authHeader } from "./test-support/auth-test-helper";

// Межтенантная изоляция (Step 4A.2): доказываем, что пользователь компании A
// не может прочитать или изменить ресурс компании B, зная только его UUID.
// Все проверяемые здесь сущности не имеют собственной колонки company_id —
// принадлежность выражена через родителя (products / warehouses /
// marketplace_accounts), поэтому именно они и были уязвимы к IDOR до этого
// шага: раньше запрос шёл по одному лишь id, без ограничения по компании.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

describe("Tenant isolation (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  let tokenService: TokenService;
  const createdCompanyNames: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;
    tokenService = app.get(TokenService);
  });

  afterAll(async () => {
    for (const name of createdCompanyNames) {
      const [company] = await db.select().from(companies).where(eq(companies.name, name));
      if (!company) continue;

      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
      const productIds = companyProducts.map((product) => product.id);
      const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
      const warehouseIds = companyWarehouses.map((warehouse) => warehouse.id);
      const companyAccounts = await db
        .select()
        .from(marketplaceAccounts)
        .where(eq(marketplaceAccounts.companyId, company.id));
      const accountIds = companyAccounts.map((account) => account.id);

      if (accountIds.length > 0) {
        await db.delete(marketplaceListings).where(inArray(marketplaceListings.marketplaceAccountId, accountIds));
        await db.delete(marketplaceSyncLogs).where(inArray(marketplaceSyncLogs.marketplaceAccountId, accountIds));
        await db.delete(marketplaceAccounts).where(inArray(marketplaceAccounts.id, accountIds));
      }
      if (warehouseIds.length > 0) {
        const counts = await db.select().from(inventoryCounts).where(inArray(inventoryCounts.warehouseId, warehouseIds));
        const countIds = counts.map((count) => count.id);
        if (countIds.length > 0) {
          await db.delete(inventoryCountItems).where(inArray(inventoryCountItems.inventoryCountId, countIds));
          await db.delete(inventoryCounts).where(inArray(inventoryCounts.id, countIds));
        }
        await db.delete(warehouses).where(inArray(warehouses.id, warehouseIds));
      }
      if (productIds.length > 0) {
        await db.delete(productVariants).where(inArray(productVariants.productId, productIds));
        await db.delete(products).where(inArray(products.id, productIds));
      }

      await db.delete(auditLog).where(eq(auditLog.companyId, company.id));
      const companyUsers = await db.select().from(users).where(eq(users.companyId, company.id));
      for (const user of companyUsers) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
        await db.delete(userRoles).where(eq(userRoles.userId, user.id));
      }
      await db.delete(users).where(eq(users.companyId, company.id));
      await db.delete(companies).where(eq(companies.id, company.id));
    }
    await app.close();
  });

  // Компания + владелец + настоящий подписанный access-токен, но БЕЗ вызова
  // /v1/auth/login: он ограничен ThrottlerGuard (5 запросов/60 сек), а этому
  // набору нужно 8 токенов подряд. Проверяется здесь не выдача токена (это
  // покрыто auth.e2e.spec.ts), а поведение guard'ов и доменного слоя на
  // валидном токене — поэтому токен выпускается тем же TokenService, что и
  // при обычном логине.
  async function createCompanyWithOwnerToken(companyName: string): Promise<string> {
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const [user] = await db
      .insert(users)
      .values({
        companyId: company.id,
        email: `tenant-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: hashPassword("test-password-123"),
        fullName: "Владелец",
      })
      .returning();
    if (!user) throw new Error("Не удалось создать тестового пользователя");

    const [ownerRole] = await db
      .select()
      .from(roles)
      .where(and(isNull(roles.companyId), eq(roles.code, "owner")))
      .limit(1);
    if (!ownerRole) throw new Error('Предустановленная роль "owner" не найдена — проверьте миграцию 0007');
    await db.insert(userRoles).values({ userId: user.id, roleId: ownerRole.id });

    return tokenService.signAccessToken({ sub: user.id, companyId: company.id, roles: ["owner"] });
  }

  // Две независимые компании с собственными владельцами: A — «атакующая»,
  // B — владелец ресурсов. Токен A валиден и содержит все нужные permissions
  // (owner), поэтому отказ ниже — именно межтенантная изоляция, а не нехватка
  // прав и не невалидный токен.
  async function setupTwoCompanies(label: string): Promise<{ tokenA: string; tokenB: string }> {
    const tokenA = await createCompanyWithOwnerToken(`E2E Tenant A ${label} ${Date.now()}`);
    const tokenB = await createCompanyWithOwnerToken(`E2E Tenant B ${label} ${Date.now()}`);
    return { tokenA, tokenB };
  }

  it("SKU модели: компания A не создаёт и не читает варианты по productId компании B", async () => {
    const { tokenA, tokenB } = await setupTwoCompanies("variants");

    const productB = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(tokenB))
        .send({ name: "Модель Б", code: `TENANT-B-${Date.now()}` })
        .expect(201)
    ).body as ProductResponseDto;

    await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(tokenB))
      .send({ productId: productB.id, size: "M", color: "Синий", skuCode: `TENANT-B-${Date.now()}-M` })
      .expect(201);

    // CREATE: добавить SKU к чужой модели нельзя.
    await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(tokenA))
      .send({ productId: productB.id, size: "L", color: "Красный", skuCode: `TENANT-A-STEAL-${Date.now()}` })
      .expect(404);

    // READ: список SKU чужой модели пуст, а не отдаёт данные компании B.
    const listResponse = await request(httpServer)
      .get("/v1/product-variants")
      .query({ productId: productB.id })
      .set(...authHeader(tokenA))
      .expect(200);
    expect(listResponse.body).toEqual([]);

    // Владелец ресурса при этом видит свой SKU — проверка не «сломала всем».
    const ownListResponse = await request(httpServer)
      .get("/v1/product-variants")
      .query({ productId: productB.id })
      .set(...authHeader(tokenB))
      .expect(200);
    expect((ownListResponse.body as ProductVariantResponseDto[]).length).toBe(1);
  });

  it("предпросмотр раскладки заказа: компания A не получает размерный ряд модели компании B", async () => {
    const { tokenA, tokenB } = await setupTwoCompanies("preview");

    const productB = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(tokenB))
        .send({ name: "Модель Б превью", code: `TENANT-B-PREVIEW-${Date.now()}` })
        .expect(201)
    ).body as ProductResponseDto;
    await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(tokenB))
      .send({ productId: productB.id, size: "M", color: "Синий", skuCode: `TENANT-B-PREVIEW-${Date.now()}-M` })
      .expect(201);

    // У компании A эта модель «не существует» → нет ни одного SKU.
    const previewResponse = await request(httpServer)
      .post("/v1/production-orders/preview-variants")
      .set(...authHeader(tokenA))
      .send({ productId: productB.id, totalQuantity: 10 });
    expect(previewResponse.status).toBe(400);
  });

  it("инвентаризация: компания A не создаёт её на складе B и не трогает инвентаризацию B", async () => {
    const { tokenA, tokenB } = await setupTwoCompanies("inventory");

    const warehouseB = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(tokenB))
        .send({ name: "Склад Б", type: "own", country: "Киргизия" })
        .expect(201)
    ).body as WarehouseResponseDto;

    const countB = (
      await request(httpServer)
        .post("/v1/inventory-counts")
        .set(...authHeader(tokenB))
        .send({ warehouseId: warehouseB.id })
        .expect(201)
    ).body as InventoryCountResponseDto;

    // CREATE на чужом складе.
    await request(httpServer)
      .post("/v1/inventory-counts")
      .set(...authHeader(tokenA))
      .send({ warehouseId: warehouseB.id })
      .expect(404);

    // ADD ITEM в чужую инвентаризацию.
    const productA = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(tokenA))
        .send({ name: "Модель А", code: `TENANT-A-INV-${Date.now()}` })
        .expect(201)
    ).body as ProductResponseDto;
    const variantA = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(tokenA))
        .send({ productId: productA.id, size: "M", color: "Чёрный", skuCode: `TENANT-A-INV-${Date.now()}-M` })
        .expect(201)
    ).body as ProductVariantResponseDto;

    await request(httpServer)
      .post(`/v1/inventory-counts/${countB.id}/items`)
      .set(...authHeader(tokenA))
      .send({ productVariantId: variantA.id, actualQuantity: 5 })
      .expect(404);

    // COMPLETE чужой инвентаризации.
    await request(httpServer)
      .post(`/v1/inventory-counts/${countB.id}/complete`)
      .set(...authHeader(tokenA))
      .expect(404);

    // Инвентаризация B осталась нетронутой — статус не изменился.
    const [countAfter] = await db.select().from(inventoryCounts).where(eq(inventoryCounts.id, countB.id));
    expect(countAfter?.status).toBe("in_progress");
  });

  it("карточка маркетплейса: компания A не меняет цену и остаток карточки компании B", async () => {
    const { tokenA, tokenB } = await setupTwoCompanies("listing");

    const productB = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(tokenB))
        .send({ name: "Модель Б МП", code: `TENANT-B-MP-${Date.now()}` })
        .expect(201)
    ).body as ProductResponseDto;
    const variantB = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(tokenB))
        .send({ productId: productB.id, size: "M", color: "Синий", skuCode: `TENANT-B-MP-${Date.now()}-M` })
        .expect(201)
    ).body as ProductVariantResponseDto;

    await request(httpServer)
      .post("/v1/marketplaces/ensure")
      .set(...authHeader(tokenB))
      .send({ code: "wildberries", name: "Wildberries" })
      .expect(201);
    const accountB = (
      await request(httpServer)
        .post("/v1/marketplace-accounts")
        .set(...authHeader(tokenB))
        .send({ marketplaceCode: "wildberries", apiCredentialsEncrypted: "encrypted-token-b" })
        .expect(201)
    ).body as MarketplaceAccountResponseDto;
    const listingB = (
      await request(httpServer)
        .post("/v1/marketplace-listings")
        .set(...authHeader(tokenB))
        .send({
          marketplaceAccountId: accountB.id,
          productVariantId: variantB.id,
          externalSkuId: `WB-TENANT-B-${Date.now()}`,
          currentPrice: 3500,
          currentStockReported: 10,
        })
        .expect(201)
    ).body as MarketplaceListingResponseDto;

    // UPDATE цены и остатка чужой карточки.
    await request(httpServer)
      .post(`/v1/marketplace-listings/${listingB.id}/price`)
      .set(...authHeader(tokenA))
      .send({ currentPrice: 1 })
      .expect(404);
    await request(httpServer)
      .post(`/v1/marketplace-listings/${listingB.id}/stock`)
      .set(...authHeader(tokenA))
      .send({ currentStockReported: 0 })
      .expect(404);

    // Данные карточки B не изменились.
    const [listingAfter] = await db.select().from(marketplaceListings).where(eq(marketplaceListings.id, listingB.id));
    expect(Number(listingAfter?.currentPrice)).toBe(3500);
    expect(Number(listingAfter?.currentStockReported)).toBe(10);

    // Журнал синхронизации в чужой кабинет тоже не записать.
    await request(httpServer)
      .post("/v1/sync-logs")
      .set(...authHeader(tokenA))
      .send({
        marketplaceAccountId: accountB.id,
        syncType: "full_sync",
        status: "success",
        startedAt: new Date().toISOString(),
      })
      .expect(404);

    const syncLogsForB = await db
      .select()
      .from(marketplaceSyncLogs)
      .where(eq(marketplaceSyncLogs.marketplaceAccountId, accountB.id));
    expect(syncLogsForB).toHaveLength(0);
  });
});
