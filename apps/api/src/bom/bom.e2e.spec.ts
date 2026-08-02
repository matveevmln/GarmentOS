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
  refreshTokens,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type { BomResponseDto, MaterialResponseDto, ProductResponseDto } from "@garmentos/shared-types";
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

describe("BOM API (e2e)", () => {
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
        const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
        for (const bom of companyBoms) {
          await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
        }
        await db.delete(boms).where(eq(boms.companyId, company.id));
        await db.delete(materials).where(eq(materials.companyId, company.id));
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

  it("создаёт черновик BOM, утверждает его, находит через /v1/boms/approved; повторное утверждение — 409", async () => {
    const companyName = `E2E Bom ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Петроль", code: "HOODIE-PETROL-BOM-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Оксфорд 280", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    await request(httpServer)
      .get("/v1/boms/approved")
      .set(...authHeader(accessToken))
      .query({ productId: product.id })
      .expect(404);

    const draftResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1.2, wastePercent: 5 }] })
      .expect(201);
    const draft = draftResponse.body as BomResponseDto;
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(1);

    const approvedResponse = await request(httpServer)
      .post(`/v1/boms/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approved = approvedResponse.body as BomResponseDto;
    expect(approved.status).toBe("approved");

    const foundResponse = await request(httpServer)
      .get("/v1/boms/approved")
      .set(...authHeader(accessToken))
      .query({ productId: product.id })
      .expect(200);
    const found = foundResponse.body as BomResponseDto;
    expect(found.id).toBe(draft.id);

    const conflictResponse = await request(httpServer)
      .post(`/v1/boms/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("BOM_NOT_DRAFT");
  });

  it("POST /v1/boms без позиций — 400; procurement_manager без bom.approve — 403", async () => {
    const companyName = `E2E Bom Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Куртка Норд", code: "JACKET-NORD-BOM-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [] })
      .expect(400);

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Ткань", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const draftResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1 }] })
      .expect(201);
    const draft = draftResponse.body as BomResponseDto;

    const { accessToken: procurementManagerToken } = await setupAuthenticatedCompany(
      db,
      httpServer,
      `${companyName} Procurement`,
      "procurement_manager",
    );
    await request(httpServer)
      .post(`/v1/boms/${draft.id}/approve`)
      .set(...authHeader(procurementManagerToken))
      .expect(403);
  });
});
