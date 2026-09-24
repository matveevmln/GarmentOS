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
  productionOrders,
  productionOrderVariants,
  products,
  productVariants,
  refreshTokens,
  sewingOrders,
  userRoles,
  users,
  workshops,
} from "@garmentos/db-schema";
import type {
  ProductResponseDto,
  ProductVariantResponseDto,
  SewingOrderResponseDto,
  SewingOrderWithProductionOrdersResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

// T01 (docs/tasks/T01.md, ADR 0002) — заказ на пошив: общая шапка над одной
// или несколькими партиями по моделям. Постоянный regression-тест, не
// временный зонд.
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

async function cleanupCompany(name: string): Promise<void> {
  const [company] = await db.select().from(companies).where(eq(companies.name, name));
  if (!company) return;

  await db.delete(auditLog).where(eq(auditLog.companyId, company.id));

  const companyOrders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company.id));
  for (const order of companyOrders) {
    await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
  }
  await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
  await db.delete(sewingOrders).where(eq(sewingOrders.companyId, company.id));

  const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
  for (const product of companyProducts) {
    await db.delete(productVariants).where(eq(productVariants.productId, product.id));
    // ensureApprovedBomForProduct (BomApprovalPort) заводит пустой BOM
    // прозрачно при размещении — подчищаем его здесь же.
    const productBoms = await db.select().from(boms).where(eq(boms.productId, product.id));
    for (const bom of productBoms) {
      await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
    }
    await db.delete(boms).where(eq(boms.productId, product.id));
  }
  await db.delete(products).where(eq(products.companyId, company.id));
  await db.delete(workshops).where(eq(workshops.companyId, company.id));

  const companyUsers = await db.select().from(users).where(eq(users.companyId, company.id));
  for (const user of companyUsers) {
    await db.delete(auditLog).where(eq(auditLog.userId, user.id));
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    await db.delete(userRoles).where(eq(userRoles.userId, user.id));
  }
  await db.delete(users).where(eq(users.companyId, company.id));
  await db.delete(companies).where(eq(companies.id, company.id));
}

describe("Sewing Orders API — заказ на пошив с несколькими моделями (e2e, T01)", () => {
  let app: INestApplication;
  let httpServer: Server;
  const createdCompanyNames: string[] = [];

  let companyA: { companyId: string; userId: string; accessToken: string };
  let companyB: { companyId: string; userId: string; accessToken: string };
  let workshopA: WorkshopResponseDto;
  let workshopB: WorkshopResponseDto;
  let productA1: ProductResponseDto;
  let productA2: ProductResponseDto;
  let productB: ProductResponseDto;
  let variantsA1: ProductVariantResponseDto[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;

    const suffix = Date.now();
    const nameA = `T01 Sewing Order A ${suffix}`;
    const nameB = `T01 Sewing Order B ${suffix}`;
    createdCompanyNames.push(nameA, nameB);

    companyA = await setupAuthenticatedCompany(db, httpServer, nameA, "owner");
    companyB = await setupAuthenticatedCompany(db, httpServer, nameB, "owner");

    workshopA = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(companyA.accessToken))
        .send({ name: "Цех A" })
        .expect(201)
    ).body as WorkshopResponseDto;
    workshopB = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(companyB.accessToken))
        .send({ name: "Цех B" })
        .expect(201)
    ).body as WorkshopResponseDto;

    // Модель 1 компании A: два цвета (Петроль/Чёрный), два размера (M/L).
    productA1 = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(companyA.accessToken))
        .send({ name: "Худи A1", code: `T01-A1-${suffix}` })
        .expect(201)
    ).body as ProductResponseDto;
    variantsA1 = [];
    for (const [color, size] of [
      ["Петроль", "M"],
      ["Петроль", "L"],
      ["Чёрный", "M"],
      ["Чёрный", "L"],
    ]) {
      variantsA1.push(
        (
          await request(httpServer)
            .post("/v1/product-variants")
            .set(...authHeader(companyA.accessToken))
            .send({ productId: productA1.id, size, color, skuCode: `T01-A1-${suffix}-${color}-${size}` })
            .expect(201)
        ).body as ProductVariantResponseDto,
      );
    }

    // Модель 2 компании A: один цвет, один размер — вторая модель заказа.
    productA2 = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(companyA.accessToken))
        .send({ name: "Худи A2", code: `T01-A2-${suffix}` })
        .expect(201)
    ).body as ProductResponseDto;
    await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(companyA.accessToken))
      .send({ productId: productA2.id, size: "OneSize", color: "Белый", skuCode: `T01-A2-${suffix}-M` })
      .expect(201);

    // Модель компании B — используется в тестах чужого доступа.
    productB = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(companyB.accessToken))
        .send({ name: "Худи B", code: `T01-B-${suffix}` })
        .expect(201)
    ).body as ProductResponseDto;
    await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(companyB.accessToken))
      .send({ productId: productB.id, size: "M", color: "Синий", skuCode: `T01-B-${suffix}-M` })
      .expect(201);
  });

  afterAll(async () => {
    for (const name of createdCompanyNames) await cleanupCompany(name);
    await app.close();
  });

  it("создаёт черновик, сохраняет автосейвом, переживает перезагрузку", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;
    expect(draft.status).toBe("draft");
    expect(draft.version).toBe(1);
    expect(draft.workshopId).toBeNull();

    const updated = (
      await request(httpServer)
        .patch(`/v1/sewing-orders/${draft.id}`)
        .set(...authHeader(companyA.accessToken))
        .send({ version: 1, workshopId: workshopA.id, draftPayload: { models: [{ productId: productA1.id }] } })
        .expect(200)
    ).body as SewingOrderResponseDto;
    expect(updated.version).toBe(2);
    expect(updated.workshopId).toBe(workshopA.id);

    // «Перезагрузка» — новый GET видит то же самое сохранённое состояние.
    const reloaded = (
      await request(httpServer)
        .get(`/v1/sewing-orders/${draft.id}`)
        .set(...authHeader(companyA.accessToken))
        .expect(200)
    ).body as SewingOrderWithProductionOrdersResponseDto;
    expect(reloaded.version).toBe(2);
    expect(reloaded.draftPayload).toEqual({ models: [{ productId: productA1.id }] });
    expect(reloaded.productionOrders).toEqual([]);
  });

  it("две вкладки — устаревшая версия автосейва получает 409, не тихую перезапись", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;

    // Вкладка 1 сохраняет первой.
    await request(httpServer)
      .patch(`/v1/sewing-orders/${draft.id}`)
      .set(...authHeader(companyA.accessToken))
      .send({ version: 1, draftPayload: { note: "вкладка 1" } })
      .expect(200);

    // Вкладка 2 отправляет автосейв со СТАРОЙ версией (не знала про вкладку 1).
    const conflict = await request(httpServer)
      .patch(`/v1/sewing-orders/${draft.id}`)
      .set(...authHeader(companyA.accessToken))
      .send({ version: 1, draftPayload: { note: "вкладка 2 — потеряно бы" } })
      .expect(409);
    expect((conflict.body as ErrorResponseBody).code).toBe("SEWING_ORDER_VERSION_CONFLICT");

    // Данные вкладки 1 не тронуты.
    const reloaded = (
      await request(httpServer)
        .get(`/v1/sewing-orders/${draft.id}`)
        .set(...authHeader(companyA.accessToken))
        .expect(200)
    ).body as SewingOrderWithProductionOrdersResponseDto;
    expect(reloaded.draftPayload).toEqual({ note: "вкладка 1" });
  });

  it("создаёт заказ из двух моделей одной шапкой — партии сразу placed, повтор того же ключа не дублирует", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;

    const placeBody = {
      workshopId: workshopA.id,
      clientRequestId: `place-${draft.id}`,
      models: [
        {
          productId: productA1.id,
          agreedUnitPrice: 500,
          distributionMode: "template",
          colors: [
            {
              color: "Петроль",
              quantity: 100,
              percentages: [
                { size: "M", percent: 50 },
                { size: "L", percent: 50 },
              ],
            },
            {
              color: "Чёрный",
              quantity: 50,
              percentages: [
                { size: "M", percent: 40 },
                { size: "L", percent: 60 },
              ],
            },
          ],
        },
        {
          productId: productA2.id,
          agreedUnitPrice: 300,
          distributionMode: "template",
          colors: [
            {
              color: "Белый",
              quantity: 40,
              percentages: [{ size: "OneSize", percent: 100 }],
            },
          ],
        },
      ],
    };

    const placed = (
      await request(httpServer)
        .post(`/v1/sewing-orders/${draft.id}/place`)
        .set(...authHeader(companyA.accessToken))
        .send(placeBody)
        .expect(201)
    ).body as SewingOrderWithProductionOrdersResponseDto;

    expect(placed.status).toBe("placed");
    expect(placed.number).toBeGreaterThan(0);
    expect(placed.productionOrders).toHaveLength(2);
    // A delayed autosave response must never mutate a placed order.
    await request(httpServer)
      .patch(`/v1/sewing-orders/${draft.id}`)
      .set(...authHeader(companyA.accessToken))
      .send({ version: draft.version, draftPayload: { note: "late autosave" } })
      .expect(409);
    const afterLateSave = (await request(httpServer)
      .get(`/v1/sewing-orders/${draft.id}`)
      .set(...authHeader(companyA.accessToken))
      .expect(200)).body as SewingOrderWithProductionOrdersResponseDto;
    expect(afterLateSave.draftPayload).not.toEqual({ note: "late autosave" });
    expect(placed.productionOrders.every((order) => order.status === "placed")).toBe(true);
    expect(placed.productionOrders.every((order) => order.sewingOrderId === draft.id)).toBe(true);

    const model1Order = placed.productionOrders.find((order) => order.productId === productA1.id);
    expect(model1Order).toBeDefined();
    // Петроль 100 (50/50) → 50/50; Чёрный 50 (40/60) → 20/30. Итого 150.
    expect(Number(model1Order?.plannedQuantity)).toBe(150);
    const model2Order = placed.productionOrders.find((order) => order.productId === productA2.id);
    expect(Number(model2Order?.plannedQuantity)).toBe(40);

    // Повтор с тем же clientRequestId — тот же результат, без новых партий.
    const repeated = (
      await request(httpServer)
        .post(`/v1/sewing-orders/${draft.id}/place`)
        .set(...authHeader(companyA.accessToken))
        .send(placeBody)
        .expect(201)
    ).body as SewingOrderWithProductionOrdersResponseDto;
    expect(repeated.productionOrders).toHaveLength(2);
    expect(repeated.number).toBe(placed.number);

    const rowsInDb = await db.select().from(productionOrders).where(eq(productionOrders.sewingOrderId, draft.id));
    expect(rowsInDb).toHaveLength(2);

    // Другой clientRequestId у уже размещённого заказа — конфликт, не вторая группа партий.
    const conflictPlace = await request(httpServer)
      .post(`/v1/sewing-orders/${draft.id}/place`)
      .set(...authHeader(companyA.accessToken))
      .send({ ...placeBody, clientRequestId: "иной-ключ" })
      .expect(409);
    expect((conflictPlace.body as ErrorResponseBody).code).toBe("SEWING_ORDER_ALREADY_PLACED");

    const rowsAfterConflict = await db.select().from(productionOrders).where(eq(productionOrders.sewingOrderId, draft.id));
    expect(rowsAfterConflict).toHaveLength(2);
  });

  it("ручной режим: ячейки складываются в итог напрямую, без пересчёта по шаблону (R02)", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;

    const placed = (
      await request(httpServer)
        .post(`/v1/sewing-orders/${draft.id}/place`)
        .set(...authHeader(companyA.accessToken))
        .send({
          workshopId: workshopA.id,
          clientRequestId: `manual-${draft.id}`,
          models: [
            {
              productId: productA1.id,
              agreedUnitPrice: 500,
              distributionMode: "manual",
              colors: [
                { color: "Петроль", cells: [{ size: "M", quantity: 7 }, { size: "L", quantity: 13 }] },
                { color: "Чёрный", cells: [{ size: "M", quantity: 0 }, { size: "L", quantity: 5 }] },
              ],
            },
          ],
        })
        .expect(201)
    ).body as SewingOrderWithProductionOrdersResponseDto;

    // 7 + 13 + 0 + 5 = 25; нулевая ячейка не создаёт строку варианта.
    expect(Number(placed.productionOrders[0]?.plannedQuantity)).toBe(25);
    expect(placed.productionOrders[0]?.variants).toHaveLength(3);
  });

  it("ошибка во второй модели откатывает весь заказ целиком — ни одна партия не создаётся", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;

    const response = await request(httpServer)
      .post(`/v1/sewing-orders/${draft.id}/place`)
      .set(...authHeader(companyA.accessToken))
      .send({
        workshopId: workshopA.id,
        clientRequestId: `atomic-${draft.id}`,
        models: [
          {
            productId: productA1.id,
            agreedUnitPrice: 500,
            distributionMode: "template",
            colors: [{ color: "Петроль", quantity: 10, percentages: [{ size: "M", percent: 50 }, { size: "L", percent: 50 }] }],
          },
          {
            // Доли не дают 100% — вторая модель отклоняется.
            productId: productA2.id,
            agreedUnitPrice: 300,
            distributionMode: "template",
            colors: [{ color: "Белый", quantity: 10, percentages: [{ size: "OneSize", percent: 90 }] }],
          },
        ],
      })
      .expect(400);
    expect((response.body as ErrorResponseBody).code).toBe("SIZE_PERCENT_SUM_INVALID");

    const rows = await db.select().from(productionOrders).where(eq(productionOrders.sewingOrderId, draft.id));
    expect(rows).toHaveLength(0);
    const [headerRow] = await db.select().from(sewingOrders).where(eq(sewingOrders.id, draft.id));
    expect(headerRow?.status).toBe("draft");
  });

  it("чужой цех — 404, ничего не создаётся", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;

    const response = await request(httpServer)
      .post(`/v1/sewing-orders/${draft.id}/place`)
      .set(...authHeader(companyA.accessToken))
      .send({
        workshopId: workshopB.id,
        clientRequestId: `foreign-workshop-${draft.id}`,
        models: [
          {
            productId: productA1.id,
            agreedUnitPrice: 500,
            distributionMode: "template",
            colors: [{ color: "Петроль", quantity: 10, percentages: [{ size: "M", percent: 50 }, { size: "L", percent: 50 }] }],
          },
        ],
      })
      .expect(404);
    expect((response.body as ErrorResponseBody).code).toBe("WORKSHOP_NOT_FOUND");

    const rows = await db.select().from(productionOrders).where(eq(productionOrders.sewingOrderId, draft.id));
    expect(rows).toHaveLength(0);
  });

  it("чужая модель — 404, ничего не создаётся (даже если первая модель заказа своя)", async () => {
    const draft = (
      await request(httpServer)
        .post("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .send({})
        .expect(201)
    ).body as SewingOrderResponseDto;

    const response = await request(httpServer)
      .post(`/v1/sewing-orders/${draft.id}/place`)
      .set(...authHeader(companyA.accessToken))
      .send({
        workshopId: workshopA.id,
        clientRequestId: `foreign-product-${draft.id}`,
        models: [
          {
            productId: productA1.id,
            agreedUnitPrice: 500,
            distributionMode: "template",
            colors: [{ color: "Петроль", quantity: 10, percentages: [{ size: "M", percent: 50 }, { size: "L", percent: 50 }] }],
          },
          {
            productId: productB.id,
            agreedUnitPrice: 300,
            distributionMode: "template",
            colors: [{ color: "Синий", quantity: 10, percentages: [{ size: "M", percent: 100 }] }],
          },
        ],
      })
      .expect(404);
    expect((response.body as ErrorResponseBody).code).toBe("PRODUCT_NOT_FOUND");

    const rows = await db.select().from(productionOrders).where(eq(productionOrders.sewingOrderId, draft.id));
    expect(rows).toHaveLength(0);
    const [headerRow] = await db.select().from(sewingOrders).where(eq(sewingOrders.id, draft.id));
    expect(headerRow?.status).toBe("draft");
  });

  it("список заказов на пошив компании доступен и не содержит чужих", async () => {
    const listA = (
      await request(httpServer)
        .get("/v1/sewing-orders")
        .set(...authHeader(companyA.accessToken))
        .expect(200)
    ).body as SewingOrderResponseDto[];
    expect(listA.length).toBeGreaterThan(0);

    const listB = (
      await request(httpServer)
        .get("/v1/sewing-orders")
        .set(...authHeader(companyB.accessToken))
        .expect(200)
    ).body as SewingOrderResponseDto[];
    const idsA = new Set(listA.map((row) => row.id));
    expect(listB.every((row) => !idsA.has(row.id))).toBe(true);
  });

  it("размеры другой компании не попадают в подсказки, новые размеры сохраняются", async () => {
    await request(httpServer).put(`/v1/products/${productA2.id}/sizes`)
      .set(...authHeader(companyA.accessToken))
      .send({ sizes: [{ size: "48-50", ratioWeight: 1 }, { size: "52-54", ratioWeight: 2 }] })
      .expect(200);
    await request(httpServer).put(`/v1/products/${productB.id}/sizes`)
      .set(...authHeader(companyB.accessToken))
      .send({ sizes: [{ size: "СЕКРЕТНЫЙ-РАЗМЕР", ratioWeight: 1 }] })
      .expect(200);
    const presetsA = (await request(httpServer).get("/v1/products/size-presets")
      .set(...authHeader(companyA.accessToken)).expect(200)).body as string[];
    expect(presetsA).toContain("48-50");
    expect(presetsA).toContain("52-54");
    expect(presetsA).not.toContain("СЕКРЕТНЫЙ-РАЗМЕР");
  });

  it("удаляет только свой черновик; размещённый заказ и чужой черновик сохраняются", async () => {
    const own = (await request(httpServer).post("/v1/sewing-orders")
      .set(...authHeader(companyA.accessToken)).send({}).expect(201)).body as SewingOrderResponseDto;
    await request(httpServer).delete(`/v1/sewing-orders/${own.id}`)
      .set(...authHeader(companyB.accessToken)).expect(404);
    await request(httpServer).get(`/v1/sewing-orders/${own.id}`)
      .set(...authHeader(companyA.accessToken)).expect(200);
    await request(httpServer).delete(`/v1/sewing-orders/${own.id}`)
      .set(...authHeader(companyA.accessToken)).expect(200);
    await request(httpServer).get(`/v1/sewing-orders/${own.id}`)
      .set(...authHeader(companyA.accessToken)).expect(404);
    const placed = (await request(httpServer).get("/v1/sewing-orders")
      .set(...authHeader(companyA.accessToken)).expect(200)).body as SewingOrderResponseDto[];
    const existingPlaced = placed.find((row) => row.status === "placed");
    expect(existingPlaced).toBeDefined();
    await request(httpServer).delete(`/v1/sewing-orders/${existingPlaced!.id}`)
      .set(...authHeader(companyA.accessToken)).expect(404);
  });

  it("положительный сценарий: accountant без contract_manufacturing.write не может разместить заказ (403)", async () => {
    const accountantName = `T01 Sewing Order Accountant ${Date.now()}`;
    createdCompanyNames.push(accountantName);
    const accountant = await setupAuthenticatedCompany(db, httpServer, accountantName, "accountant");
    await request(httpServer)
      .post("/v1/sewing-orders")
      .set(...authHeader(accountant.accessToken))
      .send({})
      .expect(403);
  });
});
