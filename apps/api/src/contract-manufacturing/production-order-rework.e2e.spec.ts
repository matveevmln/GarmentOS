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
  documentDerivatives,
  documentLinks,
  documents,
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
import { eq, inArray } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { addUserToCompany, authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

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

// P5-2 (владелец проекта, 2026-09-06) — «создать следующий заказ», который
// одновременно содержит REWORK (переделка брака за счёт цеха, бесплатно) и
// NEW (обычный оплачиваемый пошив) строки, через существующий
// POST /production-orders и существующую доменную модель (P5-1). Отдельный
// файл — собственный экземпляр приложения = собственный счётчик rate-limit
// /auth/login (5/мин); здесь 2 логина (владелец + viewer для RBAC).
describe("Production order — REWORK + NEW следующий заказ (P5-2, e2e)", () => {
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
        // source_production_order_id ссылается на другую строку той же
        // таблицы — снять ссылки перед удалением, иначе FK не даст удалить
        // заказ-источник, пока на него ссылается заказ-переделка.
        for (const order of companyOrders) {
          await db
            .update(productionOrders)
            .set({ sourceProductionOrderId: null })
            .where(eq(productionOrders.id, order.id));
        }
        await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
        const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
        for (const doc of companyDocuments) {
          await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, doc.id));
        }
        await db.delete(documentLinks).where(eq(documentLinks.companyId, company.id));
        await db.delete(documents).where(eq(documents.companyId, company.id));
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

  it("создаёт NEW-заказ (не сломан), затем REWORK+NEW заказ по мотивам QC брака источника — без изменения источника/QC/остатка", async () => {
    const companyName = `E2E Rework ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Худи Rework ${suffix}`, code: `REWORK-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantS = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size: "S", color: "Black", skuCode: `REWORK-${suffix}-S-BLACK` })
        .expect(201)
    ).body as ProductVariantResponseDto;
    const variantM = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size: "M", color: "Black", skuCode: `REWORK-${suffix}-M-BLACK` })
        .expect(201)
    ).body as ProductVariantResponseDto;
    const variantL = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size: "L", color: "Black", skuCode: `REWORK-${suffix}-L-BLACK` })
        .expect(201)
    ).body as ProductVariantResponseDto;

    const material = (
      await request(httpServer)
        .post("/v1/materials")
        .set(...authHeader(accessToken))
        .send({ name: `Футер Rework ${suffix}`, type: "fabric", unit: "m" })
        .expect(201)
    ).body as MaterialResponseDto;

    const workshop = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(accessToken))
        .send({ name: `Цех Rework ${suffix}`, contractNumber: `Д-REWORK-${suffix}` })
        .expect(201)
    ).body as WorkshopResponseDto;

    const warehouse = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(accessToken))
        .send({ name: `Склад Rework ${suffix}` })
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

    // 1. Тест #1 — обычный NEW-заказ (существующий путь) не сломан P5-2.
    const newOnlyResponse = await request(httpServer)
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
    const newOnly = newOnlyResponse.body as ProductionOrderResponseDto;
    expect(newOnly.sourceProductionOrderId).toBeNull();
    expect(newOnly.variants[0]?.variantType).toBe("new");
    expect(newOnly.variants[0]?.unitPrice).toBeNull();

    // 2. Заказ-источник: S 50 + M 50 @ 300 ₽, проводим до "принято".
    const sourceCreateResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 100,
        agreedUnitPrice: 300,
        variants: [
          { productVariantId: variantS.id, quantity: 50 },
          { productVariantId: variantM.id, quantity: 50 },
        ],
      })
      .expect(201);
    const source = sourceCreateResponse.body as ProductionOrderResponseDto;

    await request(httpServer)
      .post(`/v1/production-orders/${source.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${source.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "in_progress" })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${source.id}/status`)
      .set(...authHeader(accessToken))
      .send({ status: "ready_for_pickup" })
      .expect(201);
    const receivedSourceResponse = await request(httpServer)
      .post(`/v1/production-orders/${source.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);
    const receivedSource = receivedSourceResponse.body as ProductionOrderResponseDto;
    expect(receivedSource.status).toBe("received");

    // Остаток после приёмки источника — опорная точка для проверки "не
    // изменился" после создания rework-черновиков ниже.
    const stockAfterSourceReceive = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.warehouseId, warehouse.id));
    const stockByVariant = new Map(stockAfterSourceReceive.map((row) => [row.productVariantId, Number(row.quantityOnHand)]));
    expect(stockByVariant.get(variantS.id)).toBe(50);
    expect(stockByVariant.get(variantM.id)).toBe(50);
    // Считать движения нужно только по стокам ЭТОГО теста — vitest гоняет
    // e2e-файлы параллельно на одной garmentos_test БД, и глобальный count по
    // всей таблице ловит движения других файлов, случайно совпавших по
    // времени (ложный fail, не имеющий отношения к P5-2).
    const stockItemIdsForWarehouse = stockAfterSourceReceive.map((row) => row.id);
    const stockMovementCountBefore = (
      await db.select().from(stockMovements).where(inArray(stockMovements.stockItemId, stockItemIdsForWarehouse))
    ).length;

    // ОТК источника: good=93, defect=7.
    const qcResponse = await request(httpServer)
      .post(`/v1/production-orders/${source.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 100, goodQuantity: 93, defectQuantity: 7 })
      .expect(201);
    const qc = qcResponse.body as QcResultResponseDto;
    expect(qc.goodQuantity).toBe(93);
    expect(qc.defectQuantity).toBe(7);

    // 3. Тест #2 — чистый REWORK-заказ (без NEW-строк).
    const reworkOnlyResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 7,
        agreedUnitPrice: 0,
        sourceProductionOrderId: source.id,
        variants: [
          { productVariantId: variantS.id, quantity: 4, variantType: "rework", unitPrice: 0 },
          { productVariantId: variantM.id, quantity: 3, variantType: "rework", unitPrice: 0 },
        ],
      })
      .expect(201);
    const reworkOnly = reworkOnlyResponse.body as ProductionOrderResponseDto;
    expect(reworkOnly.status).toBe("draft");
    expect(reworkOnly.sourceProductionOrderId).toBe(source.id);
    for (const variant of reworkOnly.variants) {
      expect(variant.variantType).toBe("rework");
      expect(Number(variant.unitPrice)).toBe(0);
    }

    // 4. Тест #3 — пример из задания: смешанный REWORK + NEW заказ.
    const mixedResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 37,
        agreedUnitPrice: 500,
        sourceProductionOrderId: source.id,
        variants: [
          { productVariantId: variantS.id, quantity: 4, variantType: "rework", unitPrice: 0 },
          { productVariantId: variantM.id, quantity: 3, variantType: "rework", unitPrice: 0 },
          { productVariantId: variantS.id, quantity: 20, variantType: "new" },
          { productVariantId: variantL.id, quantity: 10, variantType: "new" },
        ],
      })
      .expect(201);
    const mixed = mixedResponse.body as ProductionOrderResponseDto;
    expect(mixed.status).toBe("draft");
    expect(mixed.sourceProductionOrderId).toBe(source.id);
    expect(mixed.plannedQuantity).toBe("37.000");
    const mixedRework = mixed.variants.filter((v) => v.variantType === "rework");
    const mixedNew = mixed.variants.filter((v) => v.variantType === "new");
    expect(mixedRework).toHaveLength(2);
    expect(mixedNew).toHaveLength(2);
    for (const variant of mixedRework) expect(Number(variant.unitPrice)).toBe(0);
    for (const variant of mixedNew) expect(variant.unitPrice).toBeNull();

    // Тест #4/#5 (доменный уровень уже покрыт unit-тестами P5-1) — здесь же
    // подтверждаем маппинг доменных ошибок в HTTP-коды по этому REST-пути.
    const reworkWithoutSourceResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 1,
        agreedUnitPrice: 0,
        variants: [{ productVariantId: variantS.id, quantity: 1, variantType: "rework", unitPrice: 0 }],
      })
      .expect(400);
    expect((reworkWithoutSourceResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_REWORK_REQUIRES_SOURCE");

    const reworkNonZeroPriceResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 1,
        agreedUnitPrice: 0,
        sourceProductionOrderId: source.id,
        variants: [{ productVariantId: variantS.id, quantity: 1, variantType: "rework", unitPrice: 300 }],
      })
      .expect(400);
    expect((reworkNonZeroPriceResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_REWORK_PRICE_NOT_ZERO");

    // Тест #8 — создание draft rework/mixed заказов не списало материалы и не
    // изменило остаток: ни новых движений, ни изменённых количеств.
    const stockAfterDrafts = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
    const stockByVariantAfter = new Map(stockAfterDrafts.map((row) => [row.productVariantId, Number(row.quantityOnHand)]));
    expect(stockByVariantAfter.get(variantS.id)).toBe(50);
    expect(stockByVariantAfter.get(variantM.id)).toBe(50);
    expect(stockByVariantAfter.has(variantL.id)).toBe(false);
    const stockMovementCountAfter = (
      await db.select().from(stockMovements).where(inArray(stockMovements.stockItemId, stockItemIdsForWarehouse))
    ).length;
    expect(stockMovementCountAfter).toBe(stockMovementCountBefore);

    // Тест #9 — заказ-источник не изменился (статус/строки/снимок).
    const sourceReloadedResponse = await request(httpServer)
      .get(`/v1/production-orders/${source.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const sourceReloaded = sourceReloadedResponse.body as ProductionOrderResponseDto;
    expect(sourceReloaded.status).toBe("received");
    expect(sourceReloaded.variants).toHaveLength(2);
    expect(sourceReloaded.costSnapshot).toEqual(receivedSource.costSnapshot);

    // Тест #10 — QC источника не изменился.
    const qcReloadedResponse = await request(httpServer)
      .get(`/v1/production-orders/${source.id}/qc`)
      .set(...authHeader(accessToken))
      .expect(200);
    const qcReloaded = qcReloadedResponse.body as QcResultResponseDto;
    expect(qcReloaded.goodQuantity).toBe(93);
    expect(qcReloaded.defectQuantity).toBe(7);

    // Реальные DB constraints/значения — не только то, что вернул JSON.
    const mixedVariantRows = await db
      .select()
      .from(productionOrderVariants)
      .where(eq(productionOrderVariants.productionOrderId, mixed.id));
    const reworkRow = mixedVariantRows.find((row) => row.variantType === "rework" && row.productVariantId === variantS.id);
    const newRow = mixedVariantRows.find((row) => row.variantType === "new" && row.productVariantId === variantL.id);
    expect(reworkRow?.unitPrice).toBe("0.00");
    expect(newRow?.unitPrice).toBeNull();
    const [mixedOrderRow] = await db.select().from(productionOrders).where(eq(productionOrders.id, mixed.id));
    expect(mixedOrderRow?.sourceProductionOrderId).toBe(source.id);

    // Существующий workflow (draft → placed → спецификация) не сломан
    // смешанными строками — подтверждение и генерация спецификации проходят
    // так же, как и для обычного заказа, при этом сумма считается по
    // строкам (rework=0), а не единой agreedUnitPrice × plannedQuantity.
    await request(httpServer)
      .post(`/v1/production-orders/${mixed.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    const specResponse = await request(httpServer)
      .post(`/v1/production-orders/${mixed.id}/generate-specification`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((specResponse.body as { docType: string }).docType).toBe("specification");
  });

  // Тест #11 — RBAC: viewer не может создать заказ пошива, право не менялось
  // (contract_manufacturing.write, как и до P5-2).
  it("RBAC: viewer не может создать заказ пошива (403), permission не создавалось заново", async () => {
    const companyName = `E2E Rework RBAC ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const owner = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const viewer = await addUserToCompany(db, httpServer, owner.companyId, "viewer");

    const product = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(owner.accessToken))
        .send({ name: `Худи RBAC ${Date.now()}`, code: `REWORK-RBAC-${Date.now()}` })
        .expect(201)
    ).body as ProductResponseDto;
    const variant = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(owner.accessToken))
        .send({ productId: product.id, size: "S", color: "Чёрный", skuCode: `REWORK-RBAC-${Date.now()}-S` })
        .expect(201)
    ).body as ProductVariantResponseDto;
    const material = (
      await request(httpServer)
        .post("/v1/materials")
        .set(...authHeader(owner.accessToken))
        .send({ name: `Материал RBAC ${Date.now()}`, type: "fabric", unit: "m" })
        .expect(201)
    ).body as MaterialResponseDto;
    const workshop = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(owner.accessToken))
        .send({ name: `Цех RBAC ${Date.now()}` })
        .expect(201)
    ).body as WorkshopResponseDto;
    const draftBom = (
      await request(httpServer)
        .post("/v1/boms")
        .set(...authHeader(owner.accessToken))
        .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1, wastePercent: 0 }] })
        .expect(201)
    ).body as BomResponseDto;
    const approvedBom = (
      await request(httpServer)
        .post(`/v1/boms/${draftBom.id}/approve`)
        .set(...authHeader(owner.accessToken))
        .expect(201)
    ).body as BomResponseDto;

    await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(viewer.accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 1,
        agreedUnitPrice: 0,
        variants: [{ productVariantId: variant.id, quantity: 1 }],
      })
      .expect(403);
  });
});
