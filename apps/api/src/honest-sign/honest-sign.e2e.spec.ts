import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  companies,
  createDb,
  markingCodeEvents,
  markingCodes,
  productVariants,
  products,
  refreshTokens,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type {
  MarkingCodeResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
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

describe("Honest Sign API (e2e)", () => {
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
        const companyCodes = await db.select().from(markingCodes).where(eq(markingCodes.companyId, company.id));
        for (const code of companyCodes) {
          await db.delete(markingCodeEvents).where(eq(markingCodeEvents.markingCodeId, code.id));
        }
        await db.delete(markingCodes).where(eq(markingCodes.companyId, company.id));
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

  it("проводит код маркировки issued → applied → introduced → sold; повторная выдача того же кода — 409", async () => {
    const companyName = `E2E HonestSign ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Петроль", code: "HOODIE-PETROL-HS-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-HS-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const codeValue = `010460000000000${Date.now()}`;
    const issuedResponse = await request(httpServer)
      .post("/v1/marking-codes")
      .set(...authHeader(accessToken))
      .send({ productVariantId: variant.id, codeValue })
      .expect(201);
    const issued = issuedResponse.body as MarkingCodeResponseDto;
    expect(issued.status).toBe("issued");

    const duplicateResponse = await request(httpServer)
      .post("/v1/marking-codes")
      .set(...authHeader(accessToken))
      .send({ productVariantId: variant.id, codeValue })
      .expect(409);
    expect((duplicateResponse.body as ErrorResponseBody).code).toBe("MARKING_CODE_ALREADY_ISSUED");

    // Недопустимый переход: нельзя ввести в оборот, минуя "применён".
    const invalidTransitionResponse = await request(httpServer)
      .post(`/v1/marking-codes/${issued.id}/introduce`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(409);
    expect((invalidTransitionResponse.body as ErrorResponseBody).code).toBe("MARKING_CODE_INVALID_STATUS_TRANSITION");

    const appliedResponse = await request(httpServer)
      .post(`/v1/marking-codes/${issued.id}/apply`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    expect((appliedResponse.body as MarkingCodeResponseDto).status).toBe("applied");

    const introducedResponse = await request(httpServer)
      .post(`/v1/marking-codes/${issued.id}/introduce`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    expect((introducedResponse.body as MarkingCodeResponseDto).status).toBe("introduced");

    const retiredResponse = await request(httpServer)
      .post(`/v1/marking-codes/${issued.id}/retire`)
      .set(...authHeader(accessToken))
      .send({ reason: "sold" })
      .expect(201);
    expect((retiredResponse.body as MarkingCodeResponseDto).status).toBe("sold");
  });

  it("marketplace_manager без honest_sign.write не может выдать код маркировки — 403", async () => {
    const companyName = `E2E HonestSign Forbidden ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "marketplace_manager");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Куртка Норд", code: "JACKET-NORD-HS-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "L", color: "Чёрный", skuCode: "JACKET-NORD-HS-E2E-L" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    await request(httpServer)
      .post("/v1/marking-codes")
      .set(...authHeader(accessToken))
      .send({ productVariantId: variant.id, codeValue: `010460000000001${Date.now()}` })
      .expect(403);
  });
});
