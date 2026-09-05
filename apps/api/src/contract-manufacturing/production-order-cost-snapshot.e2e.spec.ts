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

// Отдельный файл (не contract-manufacturing.e2e.spec.ts) сознательно —
// собственный экземпляр приложения = собственный счётчик rate-limit
// `/auth/login` (5/мин). Тот файл уже вплотную подходит к пределу своими
// тестами; добавление сюда ещё одного логина туда однажды даст случайный
// 429 вместо реальной проверки (P1-1, владелец проекта, 2026-09-05).
describe("Production Order Cost Snapshot — историческая неизменность (P1-1, e2e)", () => {
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

  it("норма расхода замораживается при confirm и не меняется вместе с новой approved-версией BOM", async () => {
    const companyName = `E2E CostSnapshot ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Снимок ${suffix}`, code: `SNAPSHOT-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Чёрный", skuCode: `SNAPSHOT-${suffix}-M` })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Стёганка готовая ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех снимка ${suffix}`, contractNumber: `Д-СНИМОК-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    // Норма v1 — 2,6 м/шт (пример владельца проекта: «Стеганка → 2,6 м»).
    const bomV1Response = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 2.6, wastePercent: 0 }] })
      .expect(201);
    const bomV1 = bomV1Response.body as BomResponseDto;
    const approvedV1Response = await request(httpServer)
      .post(`/v1/boms/${bomV1.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approvedV1 = approvedV1Response.body as BomResponseDto;

    // Заказ №1 создаётся и подтверждается ПОКА действует норма 2,6.
    const order1Response = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedV1.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 1234.5,
        variants: [{ productVariantId: variant.id, quantity: 10 }],
      })
      .expect(201);
    const order1 = order1Response.body as ProductionOrderResponseDto;

    const confirmed1Response = await request(httpServer)
      .post(`/v1/production-orders/${order1.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    const confirmed1 = confirmed1Response.body as ProductionOrderResponseDto;
    const norm1 = confirmed1.costSnapshot?.materialNorms?.find((n) => n.materialId === material.id);
    expect(norm1?.quantityPerUnit).toBe(2.6);
    // Согласованная цена пошива и её валюта — тоже в снимке (P1-1).
    expect(confirmed1.costSnapshot?.agreedUnitPrice).toBe(1234.5);
    expect(confirmed1.costSnapshot?.agreedUnitPriceCurrency).toBe("RUB");

    // Норма меняется на 2,4 — новая approved-версия BOM той же модели.
    // Утверждение архивирует v1 (P1-1, устранение неоднозначности approved).
    const bomV2Response = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 2.4, wastePercent: 0 }] })
      .expect(201);
    const bomV2 = bomV2Response.body as BomResponseDto;
    const approvedV2Response = await request(httpServer)
      .post(`/v1/boms/${bomV2.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approvedV2 = approvedV2Response.body as BomResponseDto;

    // Заказ №1, перечитанный ПОСЛЕ смены нормы, обязан остаться на 2,6.
    const reread1Response = await request(httpServer)
      .get(`/v1/production-orders/${order1.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const reread1 = reread1Response.body as ProductionOrderResponseDto;
    const rereadNorm1 = reread1.costSnapshot?.materialNorms?.find((n) => n.materialId === material.id);
    expect(rereadNorm1?.quantityPerUnit).toBe(2.6);

    // Старая (теперь архивная) версия BOM больше не approved — заказ по ней
    // разместить нельзя (устранение неоднозначности "какая версия
    // действует", не просто побочный эффект).
    const rejectedOldBomResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedV1.id,
        workshopId: workshop.id,
        plannedQuantity: 5,
        agreedUnitPrice: 500,
        variants: [{ productVariantId: variant.id, quantity: 5 }],
      })
      .expect(409);
    expect((rejectedOldBomResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_BOM_NOT_APPROVED");

    // Заказ №2, размещённый и подтверждённый на новой версии, получает
    // именно новую норму (2,4) — заморозка работает в обе стороны: не тянет
    // старое в новое, не тянет новое в старое.
    const order2Response = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedV2.id,
        workshopId: workshop.id,
        plannedQuantity: 8,
        agreedUnitPrice: 900,
        variants: [{ productVariantId: variant.id, quantity: 8 }],
      })
      .expect(201);
    const order2 = order2Response.body as ProductionOrderResponseDto;

    const confirmed2Response = await request(httpServer)
      .post(`/v1/production-orders/${order2.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    const confirmed2 = confirmed2Response.body as ProductionOrderResponseDto;
    const norm2 = confirmed2.costSnapshot?.materialNorms?.find((n) => n.materialId === material.id);
    expect(norm2?.quantityPerUnit).toBe(2.4);

    // И заказ №1 при этом остался на 2,6 — второй раз, уже после второго confirm.
    const finalRereadResponse = await request(httpServer)
      .get(`/v1/production-orders/${order1.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const finalReread = finalRereadResponse.body as ProductionOrderResponseDto;
    expect(finalReread.costSnapshot?.materialNorms?.find((n) => n.materialId === material.id)?.quantityPerUnit).toBe(
      2.6,
    );

    // Повторное подтверждение (запрещено ещё до P1-1, assertCanConfirm) —
    // и на уровне снимка второй раз его тоже не записать: убеждаемся, что
    // прежний путь (confirm дважды) продолжает падать 409, не 500 — снимок
    // не тронут при отказе.
    const reconfirmResponse = await request(httpServer)
      .post(`/v1/production-orders/${order1.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(409);
    expect((reconfirmResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_NOT_DRAFT");
  });
});
