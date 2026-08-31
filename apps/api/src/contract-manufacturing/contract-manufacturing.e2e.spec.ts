import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  bomItems,
  boms,
  companies,
  createDb,
  materials,
  productionOrders,
  productionOrderVariants,
  productVariants,
  products,
  refreshTokens,
  userRoles,
  users,
  workshops,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  MaterialResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  WorkshopResponseDto,
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

describe("Contract Manufacturing API (e2e)", () => {
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
        const companyOrders = await db
          .select()
          .from(productionOrders)
          .where(eq(productionOrders.companyId, company.id));
        for (const order of companyOrders) {
          await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
        }
        await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
        await db.delete(workshops).where(eq(workshops.companyId, company.id));
        const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
        for (const bom of companyBoms) {
          await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
        }
        await db.delete(boms).where(eq(boms.companyId, company.id));
        await db.delete(materials).where(eq(materials.companyId, company.id));
        const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
        for (const product of companyProducts) {
          await db.delete(productVariants).where(eq(productVariants.productId, product.id));
        }
        await db.delete(products).where(eq(products.companyId, company.id));
        await db.delete(auditLog).where(eq(auditLog.companyId, company.id));
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

  it("отклоняет заказ пошива без утверждённого BOM, затем создаёт и подтверждает его после утверждения", async () => {
    const companyName = `E2E ContractManufacturing ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Петроль", code: "HOODIE-PETROL-CM-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-CM-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Оксфорд 280", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      // contractNumber обязателен для подтверждения заказа (Snapshot партии,
      // owner 2026-08-03 — без него спецификация не может быть выпущена).
      .send({ name: "Цех №1 (Иваново)", specialization: "трикотаж", contractNumber: "Д-1" })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        items: [{ materialId: material.id, quantityPerUnit: 1.15, wastePercent: 4 }],
      })
      .expect(201);
    const draftBom = draftBomResponse.body as BomResponseDto;

    // Ключевой инвариант Итерации 3: без утверждённого BOM заказ пошива запрещён.
    const rejectedResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: draftBom.id,
        workshopId: workshop.id,
        plannedQuantity: 100,
        agreedUnitPrice: 450,
        variants: [{ productVariantId: variant.id, quantity: 100 }],
      })
      .expect(409);
    const rejectedBody = rejectedResponse.body as ErrorResponseBody;
    expect(rejectedBody.code).toBe("PRODUCTION_ORDER_BOM_NOT_APPROVED");

    const approvedBomResponse = await request(httpServer)
      .post(`/v1/boms/${draftBom.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approvedBom = approvedBomResponse.body as BomResponseDto;

    const orderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 100,
        agreedUnitPrice: 450,
        variants: [{ productVariantId: variant.id, quantity: 100 }],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    expect(order.status).toBe("draft");

    const confirmedResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    const confirmed = confirmedResponse.body as ProductionOrderResponseDto;
    expect(confirmed.status).toBe("placed");

    const conflictResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("PRODUCTION_ORDER_NOT_DRAFT");

    // Списочные эндпоинты (Итерация 11, apps/web).
    const workshopsListResponse = await request(httpServer)
      .get("/v1/workshops")
      .set(...authHeader(accessToken))
      .expect(200);
    expect((workshopsListResponse.body as WorkshopResponseDto[]).map((w) => w.id)).toContain(workshop.id);

    const ordersListResponse = await request(httpServer)
      .get("/v1/production-orders")
      .set(...authHeader(accessToken))
      .expect(200);
    expect((ordersListResponse.body as ProductionOrderResponseDto[]).map((o) => o.id)).toContain(order.id);
  });

  it("viewer без contract_manufacturing.write не может создать цех — 403", async () => {
    const companyName = `E2E ContractManufacturing Forbidden ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "viewer");

    await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: "Цех №2 (Бишкек)" })
      .expect(403);
  });
});
