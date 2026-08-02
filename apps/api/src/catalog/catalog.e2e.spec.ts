import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  collections,
  companies,
  createDb,
  productVariants,
  products,
  refreshTokens,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type { CollectionResponseDto, ProductResponseDto, ProductVariantResponseDto } from "@garmentos/shared-types";
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

describe("Catalog API (e2e)", () => {
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
        const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
        for (const product of companyProducts) {
          await db.delete(productVariants).where(eq(productVariants.productId, product.id));
        }
        await db.delete(products).where(eq(products.companyId, company.id));
        await db.delete(collections).where(eq(collections.companyId, company.id));
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

  it("создаёт коллекцию, модель и SKU; дубликат артикула — 409", async () => {
    const companyName = `E2E Catalog ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const collectionResponse = await request(httpServer)
      .post("/v1/collections")
      .set(...authHeader(accessToken))
      .send({ name: "Осень 2026", season: "autumn", year: 2026 })
      .expect(201);
    const collection = collectionResponse.body as CollectionResponseDto;
    expect(collection.status).toBe("planning");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;
    expect(product.status).toBe("draft");

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-E2E-M-PETROL" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;
    expect(variant.productId).toBe(product.id);

    const conflictResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Другое название", code: "HOODIE-PETROL-E2E" })
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("PRODUCT_CODE_TAKEN");

    // Списочные эндпоинты без ?name= (Итерация 11, apps/web).
    const productsListResponse = await request(httpServer)
      .get("/v1/products")
      .set(...authHeader(accessToken))
      .expect(200);
    expect((productsListResponse.body as ProductResponseDto[]).map((p) => p.id)).toContain(product.id);

    const variantsListResponse = await request(httpServer)
      .get(`/v1/product-variants?productId=${product.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((variantsListResponse.body as ProductVariantResponseDto[]).map((v) => v.id)).toContain(variant.id);
  });

  it("POST /v1/collections с пустым именем — 400", async () => {
    const companyName = `E2E Catalog Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    await request(httpServer)
      .post("/v1/collections")
      .set(...authHeader(accessToken))
      .send({ name: "" })
      .expect(400);
  });

  it("POST /v1/collections без токена — 401; с ролью viewer (нет catalog.write) — 403", async () => {
    const companyName = `E2E Catalog Auth ${Date.now()}`;
    createdCompanyNames.push(companyName);

    await request(httpServer).post("/v1/collections").send({ name: "Без токена" }).expect(401);

    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "viewer");
    await request(httpServer)
      .post("/v1/collections")
      .set(...authHeader(accessToken))
      .send({ name: "От viewer" })
      .expect(403);
  });
});
