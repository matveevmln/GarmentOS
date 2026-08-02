import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  companies,
  createDb,
  materials,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  suppliers,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type { MaterialResponseDto, PurchaseOrderResponseDto, SupplierResponseDto } from "@garmentos/shared-types";
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

describe("Procurement API (e2e)", () => {
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
        await db.delete(materials).where(eq(materials.companyId, company.id));
        await db.delete(suppliers).where(eq(suppliers.companyId, company.id));
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

  it("создаёт поставщика, материал, черновик закупки и подтверждает его; повторное подтверждение — 409", async () => {
    const companyName = `E2E Procurement ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "procurement_manager");

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: "Оксфорд Текстиль", type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;
    expect(supplier.status).toBe("active");

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Оксфорд 280", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const orderResponse = await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, items: [{ materialId: material.id, quantity: 500, unitPrice: 350 }] })
      .expect(201);
    const order = orderResponse.body as PurchaseOrderResponseDto;
    expect(order.status).toBe("draft");
    expect(order.items).toHaveLength(1);

    const confirmedResponse = await request(httpServer)
      .post(`/v1/purchase-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    const confirmed = confirmedResponse.body as PurchaseOrderResponseDto;
    expect(confirmed.status).toBe("sent");

    const conflictResponse = await request(httpServer)
      .post(`/v1/purchase-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("PURCHASE_ORDER_NOT_DRAFT");
  });

  it("POST /v1/purchase-orders без позиций — 400", async () => {
    const companyName = `E2E Procurement Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "procurement_manager");

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: "Фурнитура Плюс", type: "trim" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, items: [] })
      .expect(400);
  });
});
