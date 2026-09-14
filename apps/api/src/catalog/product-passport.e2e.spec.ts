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
  documentDerivatives,
  documentLinks,
  documents,
  productAttributes,
  products,
  productSizes,
  productVariants,
  refreshTokens,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type { ProductAttributeResponseDto, ProductResponseDto } from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

// Этап 2 — «Паспорт модели» (владелец проекта, 2026-09-12). Проверяет:
// - description при создании и PATCH /products/:id (правки паспорта модели,
//   отдельно от себестоимости);
// - характеристики модели (product_attributes) — CRUD и tenant isolation;
// - фото модели через существующий Document Engine
//   (docType=photo_product, entityType=product) под правами catalog.*;
// - регрессионный тест на IDOR, найденный аудитом перед этим этапом:
//   GET /products/:id/sizes раньше отдавал размерный ряд чужой компании по
//   одному лишь productId (исправлено — теперь join к products по companyId).
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

describe("Product Passport API (e2e)", () => {
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
      if (!company) continue;

      const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
      for (const doc of companyDocuments) {
        await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, doc.id));
      }
      await db.delete(documentLinks).where(eq(documentLinks.companyId, company.id));
      await db.delete(documents).where(eq(documents.companyId, company.id));

      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
      for (const product of companyProducts) {
        await db.delete(productAttributes).where(eq(productAttributes.productId, product.id));
        await db.delete(productSizes).where(eq(productSizes.productId, product.id));
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
    await app.close();
  });

  it("description задаётся при создании и правится отдельно от себестоимости; характеристики CRUD; всё видно в /products/:id", async () => {
    const companyName = `E2E Passport ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Стеганка Гашов", code: `STEGANKA-${Date.now()}`, description: "Зимняя стёганая куртка" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;
    expect(product.description).toBe("Зимняя стёганая куртка");

    const patchedResponse = await request(httpServer)
      .patch(`/v1/products/${product.id}`)
      .set(...authHeader(accessToken))
      .send({ description: "Демисезонная стёганая куртка" })
      .expect(200);
    const patched = patchedResponse.body as ProductResponseDto;
    expect(patched.description).toBe("Демисезонная стёганая куртка");
    expect(patched.name).toBe("Стеганка Гашов"); // не тронуто

    const compositionResponse = await request(httpServer)
      .post(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(accessToken))
      .send({ name: "Состав", value: "95% хлопок, 5% лайкра" })
      .expect(201);
    const composition = compositionResponse.body as ProductAttributeResponseDto;

    await request(httpServer)
      .post(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(accessToken))
      .send({ name: "Плотность", value: "260 г/м²" })
      .expect(201);

    const listResponse = await request(httpServer)
      .get(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((listResponse.body as ProductAttributeResponseDto[]).map((a) => a.name)).toEqual(["Состав", "Плотность"]);

    const updatedAttrResponse = await request(httpServer)
      .patch(`/v1/products/${product.id}/attributes/${composition.id}`)
      .set(...authHeader(accessToken))
      .send({ name: "Состав ткани", value: "95% хлопок, 5% лайкра" })
      .expect(200);
    expect((updatedAttrResponse.body as ProductAttributeResponseDto).name).toBe("Состав ткани");

    await request(httpServer)
      .delete(`/v1/products/${product.id}/attributes/${composition.id}`)
      .set(...authHeader(accessToken))
      .expect(200);

    const afterRemoveResponse = await request(httpServer)
      .get(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((afterRemoveResponse.body as ProductAttributeResponseDto[]).map((a) => a.name)).toEqual(["Плотность"]);

    // Невалидная характеристика — 400.
    await request(httpServer)
      .post(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(accessToken))
      .send({ name: "", value: "x" })
      .expect(400);

    // «История» — audit_log читается обратно впервые (Этап 2): создание,
    // правка деталей, добавление/правка/удаление характеристики — всё видно.
    const historyResponse = await request(httpServer)
      .get("/v1/audit-log")
      .set(...authHeader(accessToken))
      .query({ entityType: "product", entityId: product.id })
      .expect(200);
    const actions = (historyResponse.body as Array<{ action: string }>).map((entry) => entry.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "product.created",
        "product.details_updated",
        "product.attribute_added",
        "product.attribute_updated",
        "product.attribute_removed",
      ]),
    );
  });

  it("фото модели через Document Engine (docType=photo_product, entityType=product) под catalog.read/write", async () => {
    const companyName = `E2E Passport Photo ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Фото", code: `HOODIE-PHOTO-${Date.now()}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const uploadResponse = await request(httpServer)
      .post("/v1/documents")
      .set(...authHeader(accessToken))
      .field("docType", "photo_product")
      .field("entityType", "product")
      .field("entityId", product.id)
      .attach("file", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: "model.jpg", contentType: "image/jpeg" })
      .expect(201);
    const uploaded = uploadResponse.body as { id: string; docType: string; fileUrl: string };
    expect(uploaded.docType).toBe("photo_product");

    const listResponse = await request(httpServer)
      .get("/v1/documents")
      .set(...authHeader(accessToken))
      .query({ entityType: "product", entityId: product.id })
      .expect(200);
    expect((listResponse.body as Array<{ id: string }>).map((d) => d.id)).toContain(uploaded.id);

    const fileResponse = await request(httpServer)
      .get(`/v1/documents/${uploaded.id}/file`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect(fileResponse.headers["content-type"]).toBe("image/jpeg");
  });

  it("tenant isolation: чужая компания не видит размерный ряд/характеристики модели (регрессия найденного IDOR)", async () => {
    const companyAName = `E2E Passport IDOR A ${Date.now()}`;
    const companyBName = `E2E Passport IDOR B ${Date.now()}`;
    createdCompanyNames.push(companyAName, companyBName);
    const { accessToken: tokenA } = await setupAuthenticatedCompany(db, httpServer, companyAName, "owner");
    const { accessToken: tokenB } = await setupAuthenticatedCompany(db, httpServer, companyBName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(tokenA))
      .send({ name: "Модель компании A", code: `PROD-A-${Date.now()}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .put(`/v1/products/${product.id}/sizes`)
      .set(...authHeader(tokenA))
      .send({ sizes: [{ size: "48-50", ratioWeight: 1 }] })
      .expect(200);
    await request(httpServer)
      .post(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(tokenA))
      .send({ name: "Состав", value: "100% хлопок" })
      .expect(201);

    // Компания B не видит размерный ряд компании A по прямому productId
    // (найдено аудитом IDOR перед Этапом 2 — раньше эндпоинт отдавал ряд
    // без какой-либо проверки company_id).
    const sizesAsB = await request(httpServer)
      .get(`/v1/products/${product.id}/sizes`)
      .set(...authHeader(tokenB))
      .expect(200);
    expect(sizesAsB.body).toEqual([]);

    // Компания B не видит характеристики модели компании A.
    const attributesAsB = await request(httpServer)
      .get(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(tokenB))
      .expect(200);
    expect(attributesAsB.body).toEqual([]);

    // Компания B не может добавить/изменить/удалить характеристику чужой модели.
    await request(httpServer)
      .post(`/v1/products/${product.id}/attributes`)
      .set(...authHeader(tokenB))
      .send({ name: "Взлом", value: "x" })
      .expect(404);

    // Компания B не может изменить паспорт (description) чужой модели.
    const patchAsBResponse = await request(httpServer)
      .patch(`/v1/products/${product.id}`)
      .set(...authHeader(tokenB))
      .send({ description: "Взлом" })
      .expect(404);
    expect((patchAsBResponse.body as ErrorResponseBody).code).toBe("PRODUCT_NOT_FOUND");

    // Своя компания по-прежнему видит собственные данные.
    const sizesAsA = await request(httpServer)
      .get(`/v1/products/${product.id}/sizes`)
      .set(...authHeader(tokenA))
      .expect(200);
    expect(sizesAsA.body).toHaveLength(1);
  });
});
