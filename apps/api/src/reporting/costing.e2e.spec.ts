import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  bomItems,
  boms,
  companies,
  createDb,
  materials,
  products,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  suppliers,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  MaterialResponseDto,
  ProductResponseDto,
  SpecificationPricingResponseDto,
  SupplierResponseDto,
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

// P0-2 (владелец проекта, 2026-09-07): "Никаких скрытых автоматических
// конвертаций" — материалы могут быть закуплены в USD/KGS, пошив всегда в
// RUB (принцип 21). computeSpecificationPricing НЕ должен складывать эти
// числа в одно "итого", если валюты расходятся — здесь это проверяется на
// реальном REST-эндпоинте, а не на моке.
describe("Costing — валютная безопасность себестоимости (P0-2, e2e)", () => {
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
    for (const name of createdCompanyNames) {
      const [company] = await db.select().from(companies).where(eq(companies.name, name));
      if (company) {
        const companyOrders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        for (const order of companyOrders) {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, order.id));
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
        for (const bom of companyBoms) {
          await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
        }
        await db.delete(boms).where(eq(boms.companyId, company.id));
        await db.delete(materials).where(eq(materials.companyId, company.id));
        await db.delete(suppliers).where(eq(suppliers.companyId, company.id));
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

  it("материалы в USD + пошив в RUB — итог НЕ считается одним числом, есть явное предупреждение", async () => {
    const companyName = `E2E Costing USD ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка USD ${suffix}`, code: `COST-USD-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    // Пошив всегда в RUB (принцип 21) — задаём стоимость пошива, чтобы
    // проверить именно смешение материалы(USD) + пошив(RUB).
    await request(httpServer)
      .patch(`/v1/products/${product.id}/costs`)
      .set(...authHeader(accessToken))
      .send({ standardSewingCost: 300 })
      .expect(200);

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Плащевка ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик USD ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({
        supplierId: supplier.id,
        currency: "USD",
        items: [{ materialId: material.id, quantity: 100, unitPrice: 0.95 }],
      })
      .expect(201);

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1, wastePercent: 0 }] })
      .expect(201);
    await request(httpServer)
      .post(`/v1/boms/${(draftBomResponse.body as BomResponseDto).id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    const pricingResponse = await request(httpServer)
      .get(`/v1/costing/products/${product.id}/specification-price`)
      .set(...authHeader(accessToken))
      .expect(200);
    const pricing = pricingResponse.body as SpecificationPricingResponseDto;

    // Компоненты сохранены раздельно по валюте — не потеряны, не выдуманы.
    expect(pricing.materialCostsByCurrency).toEqual([{ currency: "USD", amountPerUnit: 0.95 }]);
    expect(pricing.sewingCostPerUnit).toBe(300);
    // ГЛАВНАЯ ПРОВЕРКА P0-2: USD (материалы) + RUB (пошив) НЕ превращается
    // в одно арифметическое число (например, 300.95).
    expect(pricing.actualCostPerUnit).toBeNull();
    expect(pricing.specificationPricePerUnit).toBeNull();
    expect(pricing.currencyWarning).not.toBeNull();
    expect(pricing.currencyWarning).toMatch(/USD/);
    expect(pricing.currencyWarning).toMatch(/RUB/);
  });

  it("материалы сразу в двух валютах (USD и KGS) — тоже не складываются, обе валюты видны раздельно", async () => {
    const companyName = `E2E Costing Mixed ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Mixed ${suffix}`, code: `COST-MIX-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const fabricResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Плащевка Mixed ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const fabric = fabricResponse.body as MaterialResponseDto;

    const trimResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Фурнитура Mixed ${suffix}`, type: "trim", unit: "pcs" })
      .expect(201);
    const trim = trimResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик Mixed ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "USD", items: [{ materialId: fabric.id, quantity: 10, unitPrice: 1 }] })
      .expect(201);
    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "KGS", items: [{ materialId: trim.id, quantity: 10, unitPrice: 5 }] })
      .expect(201);

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        items: [
          { materialId: fabric.id, quantityPerUnit: 1, wastePercent: 0 },
          { materialId: trim.id, quantityPerUnit: 1, wastePercent: 0 },
        ],
      })
      .expect(201);
    await request(httpServer)
      .post(`/v1/boms/${(draftBomResponse.body as BomResponseDto).id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    const pricingResponse = await request(httpServer)
      .get(`/v1/costing/products/${product.id}/specification-price`)
      .set(...authHeader(accessToken))
      .expect(200);
    const pricing = pricingResponse.body as SpecificationPricingResponseDto;

    expect(pricing.materialCostsByCurrency).toEqual(
      expect.arrayContaining([
        { currency: "USD", amountPerUnit: 1 },
        { currency: "KGS", amountPerUnit: 5 },
      ]),
    );
    expect(pricing.actualCostPerUnit).toBeNull();
    expect(pricing.currencyWarning).toMatch(/USD/);
    expect(pricing.currencyWarning).toMatch(/KGS/);
  });

  it("материалы и пошив в одной валюте (RUB) — итог считается одним числом, без предупреждения", async () => {
    const companyName = `E2E Costing RUB ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка RUB ${suffix}`, code: `COST-RUB-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .patch(`/v1/products/${product.id}/costs`)
      .set(...authHeader(accessToken))
      .send({ standardSewingCost: 300 })
      .expect(200);

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Плащевка RUB ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик RUB ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "RUB", items: [{ materialId: material.id, quantity: 10, unitPrice: 200 }] })
      .expect(201);

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1, wastePercent: 0 }] })
      .expect(201);
    await request(httpServer)
      .post(`/v1/boms/${(draftBomResponse.body as BomResponseDto).id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    const pricingResponse = await request(httpServer)
      .get(`/v1/costing/products/${product.id}/specification-price`)
      .set(...authHeader(accessToken))
      .expect(200);
    const pricing = pricingResponse.body as SpecificationPricingResponseDto;

    expect(pricing.actualCostPerUnit).toBe(500); // 200 (ткань) + 300 (пошив), одна валюта — считается честно
    expect(pricing.actualCostCurrency).toBe("RUB");
    expect(pricing.currencyWarning).toBeNull();
    expect(pricing.specificationPricePerUnit).toBe(325); // 500 - 175 (DEFAULT_DEDUCTION)
  });
});
