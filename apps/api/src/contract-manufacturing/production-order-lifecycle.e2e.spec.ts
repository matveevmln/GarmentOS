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
  stockItems,
  stockMovements,
  userRoles,
  users,
  warehouses,
  workshops,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  MaterialResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  WarehouseResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { and, eq } from "drizzle-orm";
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

// P3 (владелец проекта, 2026-09-06). Отдельный файл — собственный экземпляр
// приложения = собственный счётчик rate-limit /auth/login (5/мин).
//
// Существующий telegram-production-request.e2e.spec.ts уже доказывает цепочку
// placed → ready_for_pickup → received с реальной проверкой БД — но переход
// в ready_for_pickup там идёт через симуляцию Telegram-ответа цеха. На
// пилоте Telegram не настроен ни для одного цеха (см. reconciliation,
// раздел "TRUE BLOCKERS") — единственный путь провести реальную партию
// сегодня - REST-эндпоинт из P0-1. Здесь — тот же результат (реальная
// приёмка на склад), но без единого обращения к Telegram, чтобы доказать,
// что путь "draft → received" целиком проходим средствами, доступными на
// пилоте прямо сейчас.
describe("Production order — полный цикл через REST без Telegram (P3, e2e)", () => {
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
        const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
        for (const warehouse of companyWarehouses) {
          const items = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
          for (const item of items) {
            await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
          }
          await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        }
        await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
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

  it("draft → placed → in_progress → ready_for_pickup → received целиком через REST, остаток зачислен по факту", async () => {
    const companyName = `E2E Lifecycle ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Худи Цикл ${suffix}`, code: `LIFECYCLE-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "L", color: "Синий", skuCode: `LIFECYCLE-${suffix}-L` })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Футер ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех цикла ${suffix}`, contractNumber: `Д-ЦИКЛ-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад приёмки ${suffix}` })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1, wastePercent: 0 }] })
      .expect(201);
    const draftBom = draftBomResponse.body as BomResponseDto;
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
        plannedQuantity: 15,
        agreedUnitPrice: 777,
        variants: [{ productVariantId: variant.id, quantity: 15 }],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    expect(order.status).toBe("draft");

    const confirmedResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((confirmedResponse.body as ProductionOrderResponseDto).status).toBe("placed");

    // Приёмка раньше срока запрещена — до "готово к отгрузке".
    const earlyReceiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(409);
    expect((earlyReceiveResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_NOT_READY_FOR_PICKUP");

    // P0-1: переходы REST-эндпоинтом, без единого обращения к Telegram.
    const inProgressResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "in_progress" })
      .expect(201);
    expect((inProgressResponse.body as ProductionOrderResponseDto).status).toBe("in_progress");

    const readyResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "ready_for_pickup" })
      .expect(201);
    expect((readyResponse.body as ProductionOrderResponseDto).status).toBe("ready_for_pickup");

    const receiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);
    const received = receiveResponse.body as ProductionOrderResponseDto;
    expect(received.status).toBe("received");
    expect(received.receivedAt).not.toBeNull();

    // Остаток зачислен на выбранный склад по фактически принятому количеству.
    const [stockItem] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouse.id), eq(stockItems.productVariantId, variant.id)));
    expect(Number(stockItem?.quantityOnHand)).toBe(15);

    const receiveAuditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, order.id), eq(auditLog.action, "production_order.received")));
    expect(receiveAuditEntries).toHaveLength(1);

    // Терминальный статус — повторная приёмка запрещена.
    const repeatReceiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(409);
    expect((repeatReceiveResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_NOT_READY_FOR_PICKUP");
  });

  // P0-1 (владелец проекта, 2026-09-07): "ordered ≠ received" — реальный
  // пример владельца: заказано 4000, фактически принято 3993 — на склад
  // должно попасть 3993, а план (4000) не должен быть переписан.
  it("приёмка по фактическому количеству, отличному от планового: на склад зачисляется факт, план не меняется", async () => {
    const companyName = `E2E Lifecycle Actual ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Тест ${suffix}`, code: `STEGANKA-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "ONE SIZE", color: "Графит", skuCode: `STEGANKA-${suffix}-GRAFIT` })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Плащевка ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех Стеганки ${suffix}`, contractNumber: `Д-СТГ-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад Стеганки ${suffix}` })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    const draftBomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1, wastePercent: 0 }] })
      .expect(201);
    const approvedBomResponse = await request(httpServer)
      .post(`/v1/boms/${(draftBomResponse.body as BomResponseDto).id}/approve`)
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
        plannedQuantity: 4000,
        agreedUnitPrice: 450,
        variants: [{ productVariantId: variant.id, quantity: 4000 }],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "in_progress" })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "ready_for_pickup" })
      .expect(201);

    const receiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id, receivedVariants: [{ productVariantId: variant.id, quantity: 3993 }] })
      .expect(201);
    const received = receiveResponse.body as ProductionOrderResponseDto;
    const receivedVariant = received.variants.find((v) => v.productVariantId === variant.id);
    expect(receivedVariant?.quantity).toBe("4000.000"); // план не переписан фактом
    expect(receivedVariant?.receivedQuantity).toBe("3993.000");

    // На склад зачислено ФАКТИЧЕСКОЕ количество, а не плановое 4000.
    const [stockItem] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouse.id), eq(stockItems.productVariantId, variant.id)));
    expect(Number(stockItem?.quantityOnHand)).toBe(3993);

    // Аудит сохраняет и план, и факт (требование P0-1 п.6).
    const [auditEntry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, order.id), eq(auditLog.action, "production_order.received")));
    const afterJson = auditEntry?.afterJson as { variants: Array<{ plannedQuantity: string; receivedQuantity: string | null }> };
    expect(afterJson.variants[0]?.plannedQuantity).toBe("4000.000");
    expect(afterJson.variants[0]?.receivedQuantity).toBe("3993.000");

    // Нельзя передать отрицательное фактическое количество.
    const anotherOrderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 450,
        variants: [{ productVariantId: variant.id, quantity: 10 }],
      })
      .expect(201);
    const anotherOrder = anotherOrderResponse.body as ProductionOrderResponseDto;
    await request(httpServer)
      .post(`/v1/production-orders/${anotherOrder.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${anotherOrder.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "in_progress" })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${anotherOrder.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "ready_for_pickup" })
      .expect(201);
    // Отклонено на уровне схемы (nestjs-zod) — квантити ниже 0 не проходит
    // валидацию тела запроса раньше, чем дойдёт до доменной проверки.
    await request(httpServer)
      .post(`/v1/production-orders/${anotherOrder.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id, receivedVariants: [{ productVariantId: variant.id, quantity: -5 }] })
      .expect(400);
  });
});
