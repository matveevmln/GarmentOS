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

// P1, hardening перед первой реальной партией «Стеганка» (владелец проекта,
// 2026-09-07) — продолжение costing.e2e.spec.ts (P0-2), отдельный файл (а не
// новые it() там же), чтобы не превышать лимит логинов ThrottlerGuard
// (5 запросов/60с на /v1/auth/login, apps/api/src/auth/auth.controller.ts) —
// каждый .e2e.spec.ts поднимает свой экземпляр Nest-приложения в своём
// beforeAll, поэтому и счётчик throttler у него свой.
//
// Два независимых уточнения валютной безопасности:
// A. Материалы ОДНОЙ категории (например, "ткань") в разных валютах закупки
//    раньше суммировались в fabricCostPerUnit/trimCostPerUnit/packagingCostPerUnit
//    в одно число вне зависимости от валюты — сама категория теперь тоже
//    должна честно стать null, а не просто участвовать в общем предупреждении.
// D. standardSewingCost/otherProductionCost получили собственную валюту
//    (products.standard_sewing_cost_currency/other_production_cost_currency) —
//    услуга вроде стёжки, реально оплачиваемая в KGS, больше не считается
//    молча как RUB.
describe("Costing — валютная безопасность внутри категорий и стоимости пошива/прочего (P1, hardening, e2e)", () => {
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

  // A: раньше fabricCostPerUnit суммировал ВСЕ материалы типа "ткань" в одно
  // число независимо от валюты закупки каждого — основная ткань в USD и
  // подклад в RUB давали бессмысленное "150 USD/RUB". Теперь такая категория
  // должна вернуться отдельно по валютам (fabricCostPerUnit = null), а не
  // одним искажённым числом.
  it("ткань в USD + подклад в RUB (одна категория, разные валюты) — категория не считается одним числом", async () => {
    const companyName = `E2E Costing Category Mixed ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Category Mixed ${suffix}`, code: `COST-CATMIX-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const mainFabricResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Основная ткань ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const mainFabric = mainFabricResponse.body as MaterialResponseDto;

    const liningResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Подклад ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const lining = liningResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик Category Mixed ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "USD", items: [{ materialId: mainFabric.id, quantity: 10, unitPrice: 1 }] })
      .expect(201);
    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "RUB", items: [{ materialId: lining.id, quantity: 10, unitPrice: 50 }] })
      .expect(201);

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        items: [
          { materialId: mainFabric.id, quantityPerUnit: 1, wastePercent: 0 },
          { materialId: lining.id, quantityPerUnit: 1, wastePercent: 0 },
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

    // ГЛАВНАЯ ПРОВЕРКА: "ткань" — не единое число (внутри категории USD и
    // RUB одновременно), и это НЕ равно 150 (1 USD + 50 RUB).
    expect(pricing.fabricCostPerUnit).toBeNull();
    expect(pricing.actualCostPerUnit).toBeNull();
    expect(pricing.currencyWarning).not.toBeNull();
    expect(pricing.currencyWarning).toMatch(/ткань/);
    expect(pricing.currencyWarning).toMatch(/USD/);
    expect(pricing.currencyWarning).toMatch(/RUB/);
  });

  // Регрессия: две позиции одной категории в ОДНОЙ валюте по-прежнему дают
  // корректную сумму — категория не считается "смешанной" просто потому что
  // в ней больше одного материала.
  it("ткань в RUB + подклад в RUB (одна категория, одна валюта) — сумма корректна, без предупреждения", async () => {
    const companyName = `E2E Costing Category RUB ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Category RUB ${suffix}`, code: `COST-CATRUB-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const mainFabricResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Основная ткань RUB ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const mainFabric = mainFabricResponse.body as MaterialResponseDto;

    const liningResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Подклад RUB ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const lining = liningResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик Category RUB ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "RUB", items: [{ materialId: mainFabric.id, quantity: 10, unitPrice: 100 }] })
      .expect(201);
    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "RUB", items: [{ materialId: lining.id, quantity: 10, unitPrice: 50 }] })
      .expect(201);

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        items: [
          { materialId: mainFabric.id, quantityPerUnit: 1, wastePercent: 0 },
          { materialId: lining.id, quantityPerUnit: 1, wastePercent: 0 },
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

    expect(pricing.fabricCostPerUnit).toBe(150); // 100 + 50, одна валюта — сумма честная
    expect(pricing.actualCostPerUnit).toBe(150);
    expect(pricing.actualCostCurrency).toBe("RUB");
    expect(pricing.currencyWarning).toBeNull();
  });

  // D: реальный сценарий стёжки — материалы и пошив в RUB, но услуга стёжки
  // (otherProductionCost) оплачивается в KGS (владелец проекта, 2026-09-07,
  // пример: 358 575 KGS). До этой правки обе суммы (standardSewingCost/
  // otherProductionCost) считались жёстко в RUB — KGS-сумма молча
  // складывалась бы с рублями.
  it("материалы и пошив в RUB, прочие расходы (стёжка) в KGS — итог не считается одним числом", async () => {
    const companyName = `E2E Costing Quilting KGS ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Quilting ${suffix}`, code: `COST-QUILT-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .patch(`/v1/products/${product.id}/costs`)
      .set(...authHeader(accessToken))
      .send({ standardSewingCost: 700, standardSewingCostCurrency: "RUB" })
      .expect(200);
    await request(httpServer)
      .patch(`/v1/products/${product.id}/costs`)
      .set(...authHeader(accessToken))
      .send({ otherProductionCost: 75, otherProductionCostCurrency: "KGS" })
      .expect(200);

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Плащевка Quilting ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик Quilting ${suffix}`, type: "fabric" })
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

    // ГЛАВНАЯ ПРОВЕРКА P1/D: материалы(RUB) + пошив(RUB) + стёжка(KGS) НЕ
    // складываются в одно число.
    expect(pricing.actualCostPerUnit).toBeNull();
    expect(pricing.currencyWarning).not.toBeNull();
    expect(pricing.currencyWarning).toMatch(/RUB/);
    expect(pricing.currencyWarning).toMatch(/KGS/);
  });
});
