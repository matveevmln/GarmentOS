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
  cuttingOrderMaterials,
  cuttingOrderResults,
  cuttingOrders,
  materials,
  materialStockItems,
  materialStockMovements,
  productionOrders,
  productionOrderVariants,
  productVariants,
  products,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  suppliers,
  userRoles,
  users,
  warehouses,
  workshops,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  CuttingFactResponseDto,
  CuttingOrderResponseDto,
  MaterialResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  PurchaseOrderResponseDto,
  SupplierResponseDto,
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

// Отдельный файл (не production-order-cost-snapshot.e2e.spec.ts / не
// contract-manufacturing.e2e.spec.ts) — собственный экземпляр приложения =
// собственный счётчик rate-limit /auth/login (5/мин). Раскрой раньше не имел
// ни одного e2e-теста на HTTP-слое вовсе (P2, владелец проекта, 2026-09-05) —
// покрытие только доменными unit-тестами с фейковым ProductionOrderSnapshotPort.
describe("Cutting — раскрой поверх реального заказа и склада (P2, e2e)", () => {
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
          const orderCuttingOrders = await db
            .select()
            .from(cuttingOrders)
            .where(eq(cuttingOrders.productionOrderId, order.id));
          for (const cuttingOrder of orderCuttingOrders) {
            await db.delete(cuttingOrderMaterials).where(eq(cuttingOrderMaterials.cuttingOrderId, cuttingOrder.id));
            await db.delete(cuttingOrderResults).where(eq(cuttingOrderResults.cuttingOrderId, cuttingOrder.id));
          }
          await db.delete(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
          await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
        }
        await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
        await db.delete(workshops).where(eq(workshops.companyId, company.id));
        const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
        for (const bom of companyBoms) {
          await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
        }
        await db.delete(boms).where(eq(boms.companyId, company.id));
        const companyPurchaseOrders = await db
          .select()
          .from(purchaseOrders)
          .where(eq(purchaseOrders.companyId, company.id));
        for (const po of companyPurchaseOrders) {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        await db.delete(suppliers).where(eq(suppliers.companyId, company.id));
        const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
        for (const warehouse of companyWarehouses) {
          const stockItems = await db
            .select()
            .from(materialStockItems)
            .where(eq(materialStockItems.warehouseId, warehouse.id));
          for (const item of stockItems) {
            await db.delete(materialStockMovements).where(eq(materialStockMovements.materialStockItemId, item.id));
          }
          await db.delete(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
        }
        await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
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

  it("раскройное задание наследует замороженную норму снимка и списывает фактический, а не плановый расход", async () => {
    const companyName = `E2E Cutting ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    // --- Справочники ---
    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Крой ${suffix}`, code: `CUT-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Чёрный", skuCode: `CUT-${suffix}-M` })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Стёганка готовая ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик ткани ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад кроя ${suffix}` })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех кроя ${suffix}`, contractNumber: `Д-КРОЙ-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    // Приход материала на склад — с запасом, но не безграничным: 25 м, чтобы
    // ниже проверить и перерасход (требование по плану — 26 м).
    const purchaseOrderResponse = await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "USD", items: [{ materialId: material.id, quantity: 25, unitPrice: 3.2 }] })
      .expect(201);
    const purchaseOrder = purchaseOrderResponse.body as PurchaseOrderResponseDto;
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);

    // --- Норма v1 = 2,6 м/шт ---
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

    // Заказ A на 10 шт, подтверждён при действующей норме 2,6.
    const orderAResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedV1.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 500,
        variants: [{ productVariantId: variant.id, quantity: 10 }],
      })
      .expect(201);
    const orderA = orderAResponse.body as ProductionOrderResponseDto;
    await request(httpServer)
      .post(`/v1/production-orders/${orderA.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);

    // Раскройное задание строится из снимка заказа A: требуется 2,6 × 10 = 26 м.
    const cuttingAResponse = await request(httpServer)
      .post(`/v1/production-orders/${orderA.id}/cutting-orders`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const cuttingA = cuttingAResponse.body as CuttingOrderResponseDto;
    const materialRowA = cuttingA.materials.find((row) => row.materialId === material.id);
    expect(materialRowA?.requiredQuantity).toBe(26);
    // Модель/цвет/размер/количество изделий — уже в ответе, без отдельного
    // документа/сущности ради этого (P2, задание отдаёт готовое задание).
    const resultRowA = cuttingA.results.find((row) => row.productVariantId === variant.id);
    expect(resultRowA).toMatchObject({ size: "M", color: "Чёрный", plannedQuantity: 10 });

    // --- Норма меняется на 2,4 — новая approved-версия архивирует старую (P1-1) ---
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

    // Заказ B на той же модели, но на новой норме.
    const orderBResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedV2.id,
        workshopId: workshop.id,
        plannedQuantity: 10,
        agreedUnitPrice: 500,
        variants: [{ productVariantId: variant.id, quantity: 10 }],
      })
      .expect(201);
    const orderB = orderBResponse.body as ProductionOrderResponseDto;
    await request(httpServer)
      .post(`/v1/production-orders/${orderB.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);

    const cuttingBResponse = await request(httpServer)
      .post(`/v1/production-orders/${orderB.id}/cutting-orders`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const cuttingB = cuttingBResponse.body as CuttingOrderResponseDto;
    expect(cuttingB.materials.find((row) => row.materialId === material.id)?.requiredQuantity).toBe(24);

    // Задание A, перечитанное ПОСЛЕ появления новой нормы и нового заказа,
    // обязано остаться на 26 м — историческая память раскроя (P2, п.7).
    const rereadCuttingAResponse = await request(httpServer)
      .get(`/v1/cutting-orders/${cuttingA.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const rereadCuttingA = rereadCuttingAResponse.body as CuttingOrderResponseDto;
    expect(rereadCuttingA.materials.find((row) => row.materialId === material.id)?.requiredQuantity).toBe(26);

    // --- Факт: расход 27 м при плане 26 м и остатке 25 м — перерасход НЕ
    // блокирует факт, склад списывает именно фактические 27, а не план 26. ---
    await request(httpServer)
      .post(`/v1/cutting-orders/${cuttingA.id}/issue`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);

    const factResponse = await request(httpServer)
      .post(`/v1/cutting-orders/${cuttingA.id}/result`)
      .set(...authHeader(accessToken))
      .send({
        warehouseId: warehouse.id,
        materials: [{ materialId: material.id, consumedQuantity: 27 }],
        results: [{ productVariantId: variant.id, actualQuantity: 10 }],
      })
      .expect(201);
    const fact = factResponse.body as CuttingFactResponseDto;

    expect(fact.cuttingOrder.status).toBe("completed");
    // Факт зафиксирован как есть — 27, не подогнан под план 26.
    expect(fact.cuttingOrder.materials.find((row) => row.materialId === material.id)?.consumedQuantity).toBe(27);
    // Перерасход не заблокирован, но виден как расхождение с учётом.
    expect(fact.shortages).toEqual([
      expect.objectContaining({ materialId: material.id, onHandBefore: 25, consumed: 27, shortage: 2 }),
    ]);

    // Склад списал именно фактические 27 м (план был 26) — остаток должен
    // уйти в минус на 2, а не остановиться на нуле (P2, п.4-5).
    const [stockItem] = await db
      .select()
      .from(materialStockItems)
      .where(and(eq(materialStockItems.warehouseId, warehouse.id), eq(materialStockItems.materialId, material.id)));
    expect(Number(stockItem?.quantityOnHand)).toBe(-2);
  });
});
