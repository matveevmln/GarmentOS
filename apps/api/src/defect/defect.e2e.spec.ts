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
  productionOrderDefectCompensations,
  productionOrderDefects,
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
  DefectCompensationResponseDto,
  MaterialResponseDto,
  ProductionOrderDefectResponseDto,
  ProductionOrderDefectSummaryResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  QcResultResponseDto,
  WarehouseResponseDto,
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

// Этап B (ПРОМПТ №10.1/10.2, владелец проекта, 2026-09-15) — структурированный
// брак и компенсация. Отдельный файл — собственный экземпляр приложения =
// собственный счётчик rate-limit /auth/login (5/мин); здесь 2 компании
// (сценарий + проверка tenant isolation).
describe("Брак и компенсация партии (этап B, e2e)", () => {
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
          const orderDefects = await db
            .select()
            .from(productionOrderDefects)
            .where(eq(productionOrderDefects.productionOrderId, order.id));
          for (const defect of orderDefects) {
            await db
              .delete(productionOrderDefectCompensations)
              .where(eq(productionOrderDefectCompensations.defectId, defect.id));
          }
          await db
            .delete(productionOrderDefectCompensations)
            .where(eq(productionOrderDefectCompensations.compensatingProductionOrderId, order.id));
          await db.delete(productionOrderDefects).where(eq(productionOrderDefects.productionOrderId, order.id));
          await db.delete(productionOrderQcResults).where(eq(productionOrderQcResults.productionOrderId, order.id));
          await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
        }
        // source_production_order_id ссылается на другую строку той же
        // таблицы — снять ссылки перед удалением заказа-источника.
        for (const order of companyOrders) {
          await db
            .update(productionOrders)
            .set({ sourceProductionOrderId: null })
            .where(eq(productionOrders.id, order.id));
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

  async function setupProduct(accessToken: string, suffix: string) {
    const product = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(accessToken))
        .send({ name: `Худи Брак ${suffix}`, code: `DEFECT-${suffix}` })
        .expect(201)
    ).body as ProductResponseDto;
    const variantS = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size: "S", color: "Синий", skuCode: `DEFECT-${suffix}-S` })
        .expect(201)
    ).body as ProductVariantResponseDto;
    const variantM = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size: "M", color: "Синий", skuCode: `DEFECT-${suffix}-M` })
        .expect(201)
    ).body as ProductVariantResponseDto;
    const material = (
      await request(httpServer)
        .post("/v1/materials")
        .set(...authHeader(accessToken))
        .send({ name: `Ткань Брак ${suffix}`, type: "fabric", unit: "m" })
        .expect(201)
    ).body as MaterialResponseDto;
    const workshop = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(accessToken))
        .send({ name: `Цех Брак ${suffix}`, contractNumber: `Д-DEFECT-${suffix}` })
        .expect(201)
    ).body as WorkshopResponseDto;
    const warehouse = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(accessToken))
        .send({ name: `Склад Брак ${suffix}` })
        .expect(201)
    ).body as WarehouseResponseDto;
    const draftBom = (
      await request(httpServer)
        .post("/v1/boms")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1, wastePercent: 0 }] })
        .expect(201)
    ).body as BomResponseDto;
    const approvedBom = (
      await request(httpServer)
        .post(`/v1/boms/${draftBom.id}/approve`)
        .set(...authHeader(accessToken))
        .expect(201)
    ).body as BomResponseDto;
    return { product, variantS, variantM, workshop, warehouse, approvedBom };
  }

  async function driveOrderToReceived(
    accessToken: string,
    orderId: string,
    warehouseId: string,
  ): Promise<ProductionOrderResponseDto> {
    await request(httpServer)
      .post(`/v1/production-orders/${orderId}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${orderId}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "in_progress" })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${orderId}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "ready_for_pickup" })
      .expect(201);
    const receivedResponse = await request(httpServer)
      .post(`/v1/production-orders/${orderId}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId })
      .expect(201);
    return receivedResponse.body as ProductionOrderResponseDto;
  }

  it("сценарий владельца: 100 произведено → 100 принято, 10 брак → компенсация 10 через REWORK-заказ → 0 осталось", async () => {
    const companyName = `E2E Defect ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;
    const { variantS, product, workshop, warehouse, approvedBom } = await setupProduct(accessToken, suffix);

    // Партия №1: 100 шт. Произведено = plannedQuantity = 100.
    const sourceResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 100,
        agreedUnitPrice: 300,
        variants: [{ productVariantId: variantS.id, quantity: 100 }],
      })
      .expect(201);
    const source = sourceResponse.body as ProductionOrderResponseDto;

    await driveOrderToReceived(accessToken, source.id, warehouse.id);

    // ОТК: принято 100, годных 90, брак 10 — без деталировки (агрегатная
    // строка, Zero Input по умолчанию).
    const qcResponse = await request(httpServer)
      .post(`/v1/production-orders/${source.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 100, goodQuantity: 90, defectQuantity: 10 })
      .expect(201);
    const qc = qcResponse.body as QcResultResponseDto;
    expect(qc.defectQuantity).toBe(10);

    // Дефект создан автоматически вместе с ОТК — реальная строка в БД.
    const [defectRow] = await db
      .select()
      .from(productionOrderDefects)
      .where(eq(productionOrderDefects.productionOrderId, source.id));
    expect(defectRow).toBeDefined();
    expect(Number(defectRow?.quantity)).toBe(10);
    expect(defectRow?.productVariantId).toBeNull();

    // Повторная запись брака для того же результата ОТК запрещена (assertNoExistingDefectsForQcResult
    // защищает даже без прямого REST-эндпоинта — проверяем через повторный QC, который сам по себе
    // уже отклонён QC_RESULT_ALREADY_EXISTS, так что здесь достаточно проверить список.
    const defectsAfterQc = (
      await request(httpServer)
        .get(`/v1/production-orders/${source.id}/defects`)
        .set(...authHeader(accessToken))
        .expect(200)
    ).body as ProductionOrderDefectResponseDto[];
    expect(defectsAfterQc).toHaveLength(1);
    expect(defectsAfterQc[0]?.quantity).toBe(10);
    expect(defectsAfterQc[0]?.compensatedQuantity).toBe(0);
    expect(defectsAfterQc[0]?.remainingQuantity).toBe(10);
    const defect = defectsAfterQc[0];

    // Сводка партии: Произведено 100 / Брак 10 / Компенсировано 0 / Осталось 10.
    const summaryBeforeCompensation = (
      await request(httpServer)
        .get(`/v1/production-orders/${source.id}/defect-summary`)
        .set(...authHeader(accessToken))
        .expect(200)
    ).body as ProductionOrderDefectSummaryResponseDto;
    expect(summaryBeforeCompensation).toEqual({
      producedQuantity: 100,
      defectQuantity: 10,
      compensatedQuantity: 0,
      remainingToCompensate: 10,
    });

    // Следующий заказ: REWORK на 10 шт, явно ссылается на партию-источник.
    const reworkResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 0,
        sourceProductionOrderId: source.id,
        variants: [{ productVariantId: variantS.id, quantity: 10, variantType: "rework", unitPrice: 0 }],
      })
      .expect(201);
    const reworkOrder = reworkResponse.body as ProductionOrderResponseDto;
    const reworkVariant = reworkOrder.variants[0];

    // Попытка компенсации заказом, который НЕ ссылается на партию-источник —
    // отклонена (владелец проекта, п.3: явная проверка целостности, не
    // доверие одному клику).
    const unrelatedResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 300,
        variants: [{ productVariantId: variantS.id, quantity: 10 }],
      })
      .expect(201);
    const unrelatedOrder = unrelatedResponse.body as ProductionOrderResponseDto;

    const mismatchResponse = await request(httpServer)
      .post(`/v1/defects/${defect.id}/compensations`)
      .set(...authHeader(accessToken))
      .send({ compensatingProductionOrderId: unrelatedOrder.id, quantity: 10 })
      .expect(400);
    expect((mismatchResponse.body as ErrorResponseBody).code).toBe("DEFECT_COMPENSATION_SOURCE_MISMATCH");

    // Компенсация, привязанная к строке типа "new" заказа-источника —
    // отклонена (не должна повторно начислить оплату за уже оплаченный
    // объём): подмешиваем NEW-строку в тот же rework-заказ.
    const mixedResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 5,
        agreedUnitPrice: 300,
        sourceProductionOrderId: source.id,
        variants: [{ productVariantId: variantS.id, quantity: 5, variantType: "new" }],
      })
      .expect(201);
    const mixedOrder = mixedResponse.body as ProductionOrderResponseDto;
    const newVariantMismatchResponse = await request(httpServer)
      .post(`/v1/defects/${defect.id}/compensations`)
      .set(...authHeader(accessToken))
      .send({ compensatingProductionOrderId: mixedOrder.id, compensatingVariantId: mixedOrder.variants[0].id, quantity: 5 })
      .expect(400);
    expect((newVariantMismatchResponse.body as ErrorResponseBody).code).toBe("DEFECT_COMPENSATION_VARIANT_NOT_REWORK");

    // Явное подтверждение пользователем — корректная компенсация.
    const compensationResponse = await request(httpServer)
      .post(`/v1/defects/${defect.id}/compensations`)
      .set(...authHeader(accessToken))
      .send({ compensatingProductionOrderId: reworkOrder.id, compensatingVariantId: reworkVariant.id, quantity: 10 })
      .expect(201);
    const compensation = compensationResponse.body as DefectCompensationResponseDto;
    expect(compensation.defectId).toBe(defect.id);
    expect(compensation.quantity).toBe(10);

    // Перекомпенсация сверх дефекта — отклонена.
    const overCompensationResponse = await request(httpServer)
      .post(`/v1/defects/${defect.id}/compensations`)
      .set(...authHeader(accessToken))
      .send({ compensatingProductionOrderId: reworkOrder.id, compensatingVariantId: reworkVariant.id, quantity: 1 })
      .expect(400);
    expect((overCompensationResponse.body as ErrorResponseBody).code).toBe("DEFECT_OVERCOMPENSATION");

    // Сводка после компенсации: Компенсировано 10 / Осталось 0.
    const summaryAfterCompensation = (
      await request(httpServer)
        .get(`/v1/production-orders/${source.id}/defect-summary`)
        .set(...authHeader(accessToken))
        .expect(200)
    ).body as ProductionOrderDefectSummaryResponseDto;
    expect(summaryAfterCompensation).toEqual({
      producedQuantity: 100,
      defectQuantity: 10,
      compensatedQuantity: 10,
      remainingToCompensate: 0,
    });

    // Аудит зафиксировал оба явных действия отдельно.
    const defectAuditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, source.id));
    expect(defectAuditEntries.some((entry) => entry.action === "production_order.defect_recorded")).toBe(true);
    const compensationAuditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, reworkOrder.id));
    expect(compensationAuditEntries.some((entry) => entry.action === "production_order.defect_compensation_created")).toBe(
      true,
    );
  });

  it("разбивка брака по SKU при ОТК: сумма строк должна совпасть с итогом, каждая строка — реальный вариант заказа", async () => {
    const companyName = `E2E Defect Breakdown ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;
    const { variantS, variantM, product, workshop, warehouse, approvedBom } = await setupProduct(accessToken, suffix);

    const orderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 20,
        agreedUnitPrice: 300,
        variants: [
          { productVariantId: variantS.id, quantity: 10 },
          { productVariantId: variantM.id, quantity: 10 },
        ],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    await driveOrderToReceived(accessToken, order.id, warehouse.id);

    // Сумма разбивки (3+2=5) не совпадает с итогом ОТК (4) — отклонено.
    const mismatchResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({
        receivedQuantity: 20,
        goodQuantity: 16,
        defectQuantity: 4,
        defectBreakdown: [
          { productVariantId: variantS.id, quantity: 3, reason: "строчка" },
          { productVariantId: variantM.id, quantity: 2, reason: "пятно" },
        ],
      })
      .expect(400);
    expect((mismatchResponse.body as ErrorResponseBody).code).toBe("DEFECT_DRAFTS_SUM_MISMATCH");

    // Корректная разбивка — создаёт две строки, каждая со своим вариантом.
    const okResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({
        receivedQuantity: 20,
        goodQuantity: 16,
        defectQuantity: 4,
        defectBreakdown: [
          { productVariantId: variantS.id, quantity: 3, reason: "строчка" },
          { productVariantId: variantM.id, quantity: 1, reason: "пятно" },
        ],
      })
      .expect(201);
    expect((okResponse.body as QcResultResponseDto).defectQuantity).toBe(4);

    const rows = (
      await request(httpServer)
        .get(`/v1/production-orders/${order.id}/defects`)
        .set(...authHeader(accessToken))
        .expect(200)
    ).body as ProductionOrderDefectResponseDto[];
    expect(rows).toHaveLength(2);
    const byVariant = new Map(rows.map((row) => [row.productVariantId, row]));
    expect(byVariant.get(variantS.id)?.quantity).toBe(3);
    expect(byVariant.get(variantM.id)?.quantity).toBe(1);
  });

  it("tenant isolation: чужая компания не видит и не может компенсировать дефект другой компании", async () => {
    const companyAName = `E2E Defect Tenant A ${Date.now()}`;
    const companyBName = `E2E Defect Tenant B ${Date.now()}`;
    createdCompanyNames.push(companyAName, companyBName);
    const { accessToken: tokenA } = await setupAuthenticatedCompany(db, httpServer, companyAName, "owner");
    const { accessToken: tokenB } = await setupAuthenticatedCompany(db, httpServer, companyBName, "owner");
    const suffix = `${Date.now()}`;
    const { variantS, product, workshop, warehouse, approvedBom } = await setupProduct(tokenA, suffix);

    const orderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(tokenA))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 300,
        variants: [{ productVariantId: variantS.id, quantity: 10 }],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    await driveOrderToReceived(tokenA, order.id, warehouse.id);
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(tokenA))
      .send({ receivedQuantity: 10, goodQuantity: 8, defectQuantity: 2 })
      .expect(201);

    const [defectOfCompanyA] = await db
      .select()
      .from(productionOrderDefects)
      .where(eq(productionOrderDefects.productionOrderId, order.id));
    expect(defectOfCompanyA).toBeDefined();

    // Компания B не видит заказ компании A вообще (её собственный
    // production-orders/:id 404), защита прежде всего на уровне сводки,
    // которая явно смотрит заказ через findProductionOrderById(companyId, id).
    await request(httpServer)
      .get(`/v1/production-orders/${order.id}/defect-summary`)
      .set(...authHeader(tokenB))
      .expect(404);

    // Список дефектов компании B по чужому productionOrderId — пусто, не
    // чужие данные (WHERE companyId = свой — ни одной строки не совпадёт).
    const foreignList = (
      await request(httpServer)
        .get(`/v1/production-orders/${order.id}/defects`)
        .set(...authHeader(tokenB))
        .expect(200)
    ).body as ProductionOrderDefectResponseDto[];
    expect(foreignList).toEqual([]);

    // Компания B не может создать компенсацию по чужому defectId — 404,
    // не "успех по факту существования строки в базе".
    const foreignCompensationResponse = await request(httpServer)
      .post(`/v1/defects/${defectOfCompanyA.id}/compensations`)
      .set(...authHeader(tokenB))
      .send({ compensatingProductionOrderId: order.id, quantity: 2 })
      .expect(404);
    expect((foreignCompensationResponse.body as ErrorResponseBody).code).toBe("DEFECT_NOT_FOUND");
  });
});
