import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { collections, companies, createDb, productVariants, products } from "@garmentos/db-schema";
import type { CollectionResponseDto, ProductResponseDto, ProductVariantResponseDto } from "@garmentos/shared-types";
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
        await db.delete(companies).where(eq(companies.id, company.id));
      }
    }
    await app.close();
  });

  it("создаёт коллекцию, модель и SKU; дубликат артикула — 409", async () => {
    const companyName = `E2E Catalog ${Date.now()}`;
    createdCompanyNames.push(companyName);

    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const collectionResponse = await request(httpServer)
      .post("/v1/collections")
      .send({ companyId: company.id, name: "Осень 2026", season: "autumn", year: 2026 })
      .expect(201);
    const collection = collectionResponse.body as CollectionResponseDto;
    expect(collection.status).toBe("planning");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .send({ companyId: company.id, collectionId: collection.id, name: "Худи Петроль", code: "HOODIE-PETROL-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;
    expect(product.status).toBe("draft");

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-E2E-M-PETROL" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;
    expect(variant.productId).toBe(product.id);

    const conflictResponse = await request(httpServer)
      .post("/v1/products")
      .send({ companyId: company.id, name: "Другое название", code: "HOODIE-PETROL-E2E" })
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("PRODUCT_CODE_TAKEN");
  });

  it("POST /v1/collections с пустым именем — 400", async () => {
    const companyName = `E2E Catalog Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    await request(httpServer).post("/v1/collections").send({ companyId: company.id, name: "" }).expect(400);
  });
});
