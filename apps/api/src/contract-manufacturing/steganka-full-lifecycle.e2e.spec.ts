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
  documentDerivatives,
  documentLinks,
  documents,
  materials,
  materialStockItems,
  materialStockMovements,
  productionOrderQcResults,
  productionOrders,
  productionOrderVariants,
  productVariants,
  products,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  stockItems,
  stockMovements,
  suppliers,
  userRoles,
  users,
  warehouses,
  workshops,
} from "@garmentos/db-schema";
import type {
  BatchPassportResponseDto,
  BomResponseDto,
  CuttingFactResponseDto,
  CuttingOrderResponseDto,
  DocumentResponseDto,
  MaterialResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  PurchaseOrderResponseDto,
  QcResultResponseDto,
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

// P0-5 (владелец проекта, 2026-09-07) — контрольный сценарий первой реальной
// партии "Стеганка" целиком через REST: модель → цвета → размер →
// производственный заказ (Спецификация №7, 4000 = 1334+1333+1333) →
// подтверждение → snapshot → PDF спецификации → раскрой (факт 4542,
// 1514×3) → пошив → фактическая приёмка (≠ план) → ОТК → rework/новый
// заказ. Главная проверка: plannedQuantity нигде не переписывается фактом
// ни на одном из этапов — оба числа сосуществуют.
describe("Стеганка — полный жизненный цикл первой реальной партии (P0-5, e2e)", () => {
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
        const companyOrders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company.id));
        for (const order of companyOrders) {
          const orderCuttingOrders = await db.select().from(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
          for (const cuttingOrder of orderCuttingOrders) {
            await db.delete(cuttingOrderMaterials).where(eq(cuttingOrderMaterials.cuttingOrderId, cuttingOrder.id));
            await db.delete(cuttingOrderResults).where(eq(cuttingOrderResults.cuttingOrderId, cuttingOrder.id));
          }
          await db.delete(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
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
        const companyOrders2 = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        for (const po of companyOrders2) {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, po.id));
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        await db.delete(suppliers).where(eq(suppliers.companyId, company.id));
        const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
        for (const warehouse of companyWarehouses) {
          const materialItems = await db.select().from(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
          for (const item of materialItems) {
            await db.delete(materialStockMovements).where(eq(materialStockMovements.materialStockItemId, item.id));
          }
          await db.delete(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
          const finishedGoods = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
          for (const item of finishedGoods) {
            await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
          }
          await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        }
        await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
        await db.delete(materials).where(eq(materials.companyId, company.id));
        const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
        for (const product of companyProducts) {
          await db.delete(productVariants).where(eq(productVariants.productId, product.id));
        }
        await db.delete(products).where(eq(products.companyId, company.id));
        const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
        for (const document of companyDocuments) {
          await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, document.id));
        }
        await db.delete(documentLinks).where(eq(documentLinks.companyId, company.id));
        await db.delete(documents).where(eq(documents.companyId, company.id));
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

  it("Спецификация №7: 4000 (1334+1333+1333) → раскрой факт 4542 → приёмка факт 3993 → ОТК → rework, план нигде не переписан", async () => {
    const companyName = `E2E Steganka ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    // --- 1. Модель + цвета + размер ---
    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка ${suffix}`, code: `STEGANKA-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const colors = ["Графит", "Петроль", "Синий"] as const;
    const colorVariants: Record<string, ProductVariantResponseDto> = {};
    for (const color of colors) {
      const variantResponse = await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size: "ONE SIZE", color, skuCode: `STEGANKA-${suffix}-${color}` })
        .expect(201);
      colorVariants[color] = variantResponse.body as ProductVariantResponseDto;
    }

    // --- Материал + закупка + приёмка на склад ---
    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: `Плащевка стёганая ${suffix}`, type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: `Поставщик Стеганки ${suffix}`, type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    const materialWarehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад материалов Стеганки ${suffix}` })
      .expect(201);
    const materialWarehouse = materialWarehouseResponse.body as WarehouseResponseDto;

    const purchaseOrderResponse = await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, currency: "USD", items: [{ materialId: material.id, quantity: 5000, unitPrice: 0.95 }] })
      .expect(201);
    const purchaseOrder = purchaseOrderResponse.body as PurchaseOrderResponseDto;
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: materialWarehouse.id })
      .expect(201);

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

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех Стеганки ${suffix}`, contractNumber: `Д-СТГ-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const finishedGoodsWarehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад готовой продукции Стеганки ${suffix}` })
      .expect(201);
    const finishedGoodsWarehouse = finishedGoodsWarehouseResponse.body as WarehouseResponseDto;

    // --- 2. Производственный заказ — Спецификация №7, 4000 = 1334+1333+1333 ---
    const orderResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 4000,
        agreedUnitPrice: 450,
        variants: [
          { productVariantId: colorVariants["Графит"].id, quantity: 1334 },
          { productVariantId: colorVariants["Петроль"].id, quantity: 1333 },
          { productVariantId: colorVariants["Синий"].id, quantity: 1333 },
        ],
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    expect(order.plannedQuantity).toBe("4000.000");
    expect(order.variants.reduce((sum, v) => sum + Number(v.quantity), 0)).toBe(4000);

    // --- 3. Подтверждение → Snapshot (нормы/цены заморожены) ---
    const confirmedResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    const confirmed = confirmedResponse.body as ProductionOrderResponseDto;
    expect(confirmed.status).toBe("placed");
    expect(confirmed.costSnapshot).not.toBeNull();
    expect(confirmed.costSnapshot?.materialNorms).toHaveLength(1);

    // --- 4. Спецификация PDF ---
    const specResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/generate-specification`)
      .set(...authHeader(accessToken))
      .expect(201);
    const specDocument = specResponse.body as DocumentResponseDto;
    expect(specDocument.docType).toBe("specification");
    expect(specDocument.fileUrl).toBeTruthy();

    // --- 5. Раскрой: план 4000, факт 4542 (1514×3) — план НЕ переписан ---
    const cuttingResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cutting-orders`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const cuttingOrder = cuttingResponse.body as CuttingOrderResponseDto;
    // Плановый расход материала по норме 1:1 на замороженное количество 4000.
    expect(cuttingOrder.materials.find((row) => row.materialId === material.id)?.requiredQuantity).toBe(4000);
    for (const color of colors) {
      const plannedQty = color === "Графит" ? 1334 : 1333;
      expect(
        cuttingOrder.results.find((row) => row.productVariantId === colorVariants[color].id)?.plannedQuantity,
      ).toBe(plannedQty);
    }

    await request(httpServer)
      .post(`/v1/cutting-orders/${cuttingOrder.id}/issue`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);

    const cuttingFactResponse = await request(httpServer)
      .post(`/v1/cutting-orders/${cuttingOrder.id}/result`)
      .set(...authHeader(accessToken))
      .send({
        warehouseId: materialWarehouse.id,
        materials: [{ materialId: material.id, consumedQuantity: 4542 }],
        results: colors.map((color) => ({ productVariantId: colorVariants[color].id, actualQuantity: 1514 })),
      })
      .expect(201);
    const cuttingFact = cuttingFactResponse.body as CuttingFactResponseDto;
    expect(cuttingFact.cuttingOrder.status).toBe("completed");
    const cuttingTotalActual = cuttingFact.cuttingOrder.results.reduce((sum, row) => sum + Number(row.actualQuantity ?? 0), 0);
    expect(cuttingTotalActual).toBe(4542); // факт раскроя
    // ГЛАВНАЯ ПРОВЕРКА: plannedQuantity заказа осталась 4000 — раскрой её не
    // трогает (план и факт — разные факты, оба существуют одновременно).
    const orderAfterCuttingResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const orderAfterCutting = orderAfterCuttingResponse.body as ProductionOrderResponseDto;
    expect(orderAfterCutting.plannedQuantity).toBe("4000.000");
    expect(orderAfterCutting.variants.reduce((sum, v) => sum + Number(v.quantity), 0)).toBe(4000);

    // --- 6. Пошив: цех сообщает статусы ---
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

    // --- 7. Фактическая приёмка ≠ план (P0-1): 1330+1332+1331 = 3993 ---
    const receiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({
        warehouseId: finishedGoodsWarehouse.id,
        receivedVariants: [
          { productVariantId: colorVariants["Графит"].id, quantity: 1330 },
          { productVariantId: colorVariants["Петроль"].id, quantity: 1332 },
          { productVariantId: colorVariants["Синий"].id, quantity: 1331 },
        ],
      })
      .expect(201);
    const received = receiveResponse.body as ProductionOrderResponseDto;
    expect(received.status).toBe("received");
    // План (4000=1334+1333+1333) остаётся неизменным и после приёмки.
    expect(received.variants.reduce((sum, v) => sum + Number(v.quantity), 0)).toBe(4000);
    const receivedTotal = received.variants.reduce((sum, v) => sum + Number(v.receivedQuantity ?? 0), 0);
    expect(receivedTotal).toBe(3993);

    const [graphiteStock] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, finishedGoodsWarehouse.id), eq(stockItems.productVariantId, colorVariants["Графит"].id)));
    expect(Number(graphiteStock?.quantityOnHand)).toBe(1330); // факт, не план 1334

    // Паспорт партии отдаёт тот же факт по вариантам, что и ответ /receive
    // (P1, hardening перед «Стеганкой», владелец проекта, 2026-09-07) — это
    // ровно те данные, из которых веб-клиент (BatchPassportPage.tsx,
    // computeTotalReceivedQuantity) автоматически подставляет "Получено" в
    // форму ОТК, никогда не беря план (4000) вместо факта (3993).
    const passportAfterReceive = (
      await request(httpServer)
        .get(`/v1/production-orders/${order.id}/passport`)
        .set(...authHeader(accessToken))
        .expect(200)
    ).body as BatchPassportResponseDto;
    const passportReceivedTotal = passportAfterReceive.variants.reduce(
      (sum, v) => sum + Number(v.receivedQuantity ?? 0),
      0,
    );
    expect(passportReceivedTotal).toBe(3993);

    // --- 8. ОТК ---
    const qcResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 3993, goodQuantity: 3950, defectQuantity: 43 })
      .expect(201);
    const qc = qcResponse.body as QcResultResponseDto;
    expect(qc.goodQuantity).toBe(3950);
    expect(qc.defectQuantity).toBe(43);

    // --- 9. Rework: переделка брака (43 шт., бесплатно) отдельным заказом ---
    const reworkResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: approvedBom.id,
        workshopId: workshop.id,
        plannedQuantity: 43,
        agreedUnitPrice: 0,
        sourceProductionOrderId: order.id,
        variants: [{ productVariantId: colorVariants["Графит"].id, quantity: 43, variantType: "rework", unitPrice: 0 }],
      })
      .expect(201);
    const rework = reworkResponse.body as ProductionOrderResponseDto;
    expect(rework.sourceProductionOrderId).toBe(order.id);
    expect(rework.variants[0]?.variantType).toBe("rework");
    expect(Number(rework.variants[0]?.unitPrice)).toBe(0);

    // Исходный заказ остаётся неизменным (план 4000, факт приёмки 3993,
    // ОТК 3950/43) — rework не переписывает историю партии-источника.
    const sourceAfterReworkResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const sourceAfterRework = sourceAfterReworkResponse.body as ProductionOrderResponseDto;
    expect(sourceAfterRework.plannedQuantity).toBe("4000.000");
    expect(sourceAfterRework.status).toBe("received");
  });
});
