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
  productionOrders,
  productionOrderVariants,
  productVariants,
  products,
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
        await db.delete(companies).where(eq(companies.id, company.id));
      }
    }
    await app.close();
  });

  it("отклоняет заказ пошива без утверждённого BOM, затем создаёт и подтверждает его после утверждения", async () => {
    const companyName = `E2E ContractManufacturing ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .send({ companyId: company.id, name: "Худи Петроль", code: "HOODIE-PETROL-CM-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-CM-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .send({ companyId: company.id, name: "Оксфорд 280", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .send({ companyId: company.id, name: "Цех №1 (Иваново)", specialization: "трикотаж" })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .send({
        companyId: company.id,
        productId: product.id,
        items: [{ materialId: material.id, quantityPerUnit: 1.15, wastePercent: 4 }],
      })
      .expect(201);
    const draftBom = draftBomResponse.body as BomResponseDto;

    // Ключевой инвариант Итерации 3: без утверждённого BOM заказ пошива запрещён.
    const rejectedResponse = await request(httpServer)
      .post("/v1/production-orders")
      .send({
        companyId: company.id,
        productId: product.id,
        bomId: draftBom.id,
        workshopId: workshop.id,
        plannedQuantity: 150,
        agreedUnitPrice: 450,
        variants: [{ productVariantId: variant.id, quantity: 100 }],
      })
      .expect(409);
    const rejectedBody = rejectedResponse.body as ErrorResponseBody;
    expect(rejectedBody.code).toBe("PRODUCTION_ORDER_BOM_NOT_APPROVED");

    const approvedBomResponse = await request(httpServer)
      .post(`/v1/boms/${draftBom.id}/approve`)
      .send({ companyId: company.id })
      .expect(201);
    const approvedBom = approvedBomResponse.body as BomResponseDto;

    const orderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .send({
        companyId: company.id,
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 150,
        agreedUnitPrice: 450,
        variants: [{ productVariantId: variant.id, quantity: 100 }],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    expect(order.status).toBe("draft");

    const confirmedResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .send({ companyId: company.id })
      .expect(201);
    const confirmed = confirmedResponse.body as ProductionOrderResponseDto;
    expect(confirmed.status).toBe("placed");

    const conflictResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .send({ companyId: company.id })
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("PRODUCTION_ORDER_NOT_DRAFT");
  });
});
