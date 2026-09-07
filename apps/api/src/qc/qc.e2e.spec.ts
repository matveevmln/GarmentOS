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
  productionOrderQcResults,
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
  QcResultResponseDto,
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

// P4 (владелец проекта, 2026-09-06). Отдельный файл — собственный экземпляр
// приложения = собственный счётчик rate-limit /auth/login (5/мин).
describe("ОТК — результат приёмочного контроля партии (P4, e2e)", () => {
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
          await db.delete(productionOrderQcResults).where(eq(productionOrderQcResults.productionOrderId, order.id));
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

  it("фиксирует ОТК только после приёмки, не ломает приёмку и остаток, запрещает второй финальный результат", async () => {
    const companyName = `E2E QC ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Худи ОТК ${suffix}`, code: `QC-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "S", color: "Белый", skuCode: `QC-${suffix}-S` })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Кулирка ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех ОТК ${suffix}`, contractNumber: `Д-ОТК-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад ОТК ${suffix}` })
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
        plannedQuantity: 20,
        agreedUnitPrice: 300,
        variants: [{ productVariantId: variant.id, quantity: 20 }],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;

    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);

    // Сценарий 2: ОТК до приёмки — корректная ошибка, не 500.
    const tooEarlyResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 20, goodQuantity: 18, defectQuantity: 2 })
      .expect(409);
    expect((tooEarlyResponse.body as ErrorResponseBody).code).toBe("QC_PRODUCTION_ORDER_NOT_RECEIVED");

    // Доводим заказ до received — существующий путь P0-1/P3, не должен
    // сломаться из-за появления ОТК.
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
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);

    // Приёмка и складское движение не пострадали от появления ОТК.
    const [stockItem] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouse.id), eq(stockItems.productVariantId, variant.id)));
    expect(Number(stockItem?.quantityOnHand)).toBe(20);

    // Сценарий 3: годных + брака больше полученного.
    const overQuantityResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 20, goodQuantity: 18, defectQuantity: 5 })
      .expect(400);
    expect((overQuantityResponse.body as ErrorResponseBody).code).toBe("QC_QUANTITY_EXCEEDS_RECEIVED");

    // Сценарий 4: неизвестный заказ — 404, не 500.
    const unknownOrderResponse = await request(httpServer)
      .post("/v1/production-orders/00000000-0000-0000-0000-000000000000/qc")
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 20, goodQuantity: 18, defectQuantity: 2 })
      .expect(404);
    expect((unknownOrderResponse.body as ErrorResponseBody).code).toBe("QC_PRODUCTION_ORDER_NOT_FOUND");

    // Сценарий 1 (основной): ОТК после приёмки — успешно.
    const qcResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 20, goodQuantity: 18, defectQuantity: 2, comment: "2 шт брак по шву" })
      .expect(201);
    const qc = qcResponse.body as QcResultResponseDto;
    expect(qc.receivedQuantity).toBe(20);
    expect(qc.goodQuantity).toBe(18);
    expect(qc.defectQuantity).toBe(2);
    expect(qc.comment).toBe("2 шт брак по шву");

    // Реальная запись в БД — не только ответ API.
    const [qcRow] = await db
      .select()
      .from(productionOrderQcResults)
      .where(eq(productionOrderQcResults.productionOrderId, order.id));
    expect(qcRow).toBeDefined();
    expect(Number(qcRow?.goodQuantity)).toBe(18);
    expect(Number(qcRow?.defectQuantity)).toBe(2);

    // production_order_status не изменился — ОТК не статус заказа.
    const orderAfterQcResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((orderAfterQcResponse.body as ProductionOrderResponseDto).status).toBe("received");

    // GET возвращает зафиксированный результат.
    const getQcResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((getQcResponse.body as QcResultResponseDto).id).toBe(qc.id);

    // Сценарий 6: audit_log создан.
    const qcAuditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, order.id), eq(auditLog.action, "production_order.qc_recorded")));
    expect(qcAuditEntries).toHaveLength(1);
    expect(qcAuditEntries[0]?.source).toBe("http_api");

    // Сценарий 5: повторный финальный ОТК запрещён.
    const repeatQcResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 20, goodQuantity: 20, defectQuantity: 0 })
      .expect(409);
    expect((repeatQcResponse.body as ErrorResponseBody).code).toBe("QC_RESULT_ALREADY_EXISTS");
  });

  it("viewer без contract_manufacturing.write не может внести ОТК — 403", async () => {
    const companyName = `E2E QC Forbidden ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "viewer");

    await request(httpServer)
      .post("/v1/production-orders/00000000-0000-0000-0000-000000000000/qc")
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 1, goodQuantity: 1, defectQuantity: 0 })
      .expect(403);
  });
});
