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
  productionOrderDefectCompensations,
  productionOrderDefects,
  productionOrderQcResults,
  productionOrders,
  productionOrderVariants,
  productSizes,
  productVariants,
  products,
  refreshTokens,
  specificationItems,
  specifications,
  stockItems,
  stockMovements,
  userRoles,
  users,
  warehouses,
  workshops,
} from "@garmentos/db-schema";
import type {
  CuttingFactResponseDto,
  CuttingOrderResponseDto,
  DefectCompensationResponseDto,
  DocumentResponseDto,
  FulfillmentBatchListResponseDto,
  ProductionOrderDefectResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  QcResultResponseDto,
  SpecificationResponseDto,
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

// Полный жизненный цикл через КАНОНИЧЕСКУЮ Specification-first цепочку
// («Модель → Спецификация → Партия», ProductionOrdersPage.tsx) —
// не через прямой ручной POST /production-orders (тот путь уже покрыт
// steganka-full-lifecycle.e2e.spec.ts). Модель НАМЕРЕННО заводится без
// единого BOM (только размерный ряд + цвет, как в реальном мастере
// SpecificationDetailPage.tsx) — это ровно тот сценарий живого аудита
// пользовательского пути (owner, 2026-09-21, «QA Стеганка»), который нашёл
// два реальных тупика: (1) POST /specifications/:id/production-order жёстко
// требовал заранее утверждённый BOM, хотя прямой POST /production-orders уже
// год как сам заводит пустой approved BOM (ensureApprovedBomForProduct/
// createEmptyBom, ПРОМПТ №3 раздел 8); (2) раскрой такой партии (нулевые
// materialNorms в снимке) был жёстко заблокирован ошибкой
// CUTTING_MATERIAL_NORMS_MISSING, хотя вся остальная механика кроя уже
// терпима к пустому materials[]. Оба фикса — apps/api/src/bom/bom.service.ts
// (BomService.ensureApproved) и packages/domain/cutting/src/application/
// create-cutting-order.ts. Этот тест — регрессия на оба одновременно, плюс
// первое e2e-покрытие всей цепочки от спецификации до Фулфилмента.
describe("Specification → Fulfillment — полный жизненный цикл (аудит пользовательского пути, 2026-09-21)", () => {
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

      const companyOrders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company.id));
      // NEW-поток ссылается на спецификацию через production_orders.specification_id
      // (LEGACY-направление FK, specification.ts комментарий) — обнулить
      // ДО удаления specifications, иначе FK не даёт (тот же приём, что и
      // sourceProductionOrderId ниже).
      for (const order of companyOrders) {
        if (order.specificationId) {
          await db.update(productionOrders).set({ specificationId: null }).where(eq(productionOrders.id, order.id));
        }
      }
      const companySpecs = await db.select().from(specifications).where(eq(specifications.companyId, company.id));
      for (const spec of companySpecs) {
        await db.delete(specificationItems).where(eq(specificationItems.specificationId, spec.id));
      }
      await db.delete(specifications).where(eq(specifications.companyId, company.id));

      for (const order of companyOrders) {
        const orderCuttingOrders = await db.select().from(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
        for (const cuttingOrder of orderCuttingOrders) {
          await db.delete(cuttingOrderMaterials).where(eq(cuttingOrderMaterials.cuttingOrderId, cuttingOrder.id));
          await db.delete(cuttingOrderResults).where(eq(cuttingOrderResults.cuttingOrderId, cuttingOrder.id));
        }
        await db.delete(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
        const orderDefects = await db.select().from(productionOrderDefects).where(eq(productionOrderDefects.productionOrderId, order.id));
        for (const defect of orderDefects) {
          await db.delete(productionOrderDefectCompensations).where(eq(productionOrderDefectCompensations.defectId, defect.id));
        }
        await db
          .delete(productionOrderDefectCompensations)
          .where(eq(productionOrderDefectCompensations.compensatingProductionOrderId, order.id));
        await db.delete(productionOrderDefects).where(eq(productionOrderDefects.productionOrderId, order.id));
        await db.delete(productionOrderQcResults).where(eq(productionOrderQcResults.productionOrderId, order.id));
        await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
      }
      for (const order of companyOrders) {
        await db.update(productionOrders).set({ sourceProductionOrderId: null }).where(eq(productionOrders.id, order.id));
      }
      await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
      await db.delete(workshops).where(eq(workshops.companyId, company.id));

      const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
      for (const bom of companyBoms) {
        await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
      }
      await db.delete(boms).where(eq(boms.companyId, company.id));

      const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
      for (const warehouse of companyWarehouses) {
        const finishedGoods = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        for (const item of finishedGoods) {
          await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
        }
        await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
      }
      await db.delete(warehouses).where(eq(warehouses.companyId, company.id));

      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
      for (const product of companyProducts) {
        await db.delete(productVariants).where(eq(productVariants.productId, product.id));
        await db.delete(productSizes).where(eq(productSizes.productId, product.id));
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
    await app.close();
  });

  it("модель без BOM → размеры/цвета → спецификация → approve → PDF → партия → раскрой → пошив → приёмка → ОТК с причиной брака → компенсация → фулфилмент", async () => {
    const companyName = `E2E SpecToFulfillment ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    // --- 1. Модель БЕЗ единого BOM: размерный ряд + два цвета (мастер спецификации) ---
    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `E2E Стеганка ${suffix}`, code: `E2E-STG-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    await request(httpServer)
      .put(`/v1/products/${product.id}/sizes`)
      .set(...authHeader(accessToken))
      .send({ sizes: [{ size: "48", ratioWeight: 2 }, { size: "50", ratioWeight: 3 }] })
      .expect(200);
    await request(httpServer)
      .post(`/v1/products/${product.id}/colors`)
      .set(...authHeader(accessToken))
      .send({ color: "Чёрный", colorCode: "CHERN" })
      .expect(201);

    const variantsResponse = await request(httpServer)
      .get("/v1/product-variants")
      .set(...authHeader(accessToken))
      .query({ productId: product.id })
      .expect(200);
    const variants = variantsResponse.body as ProductVariantResponseDto[];
    expect(variants).toHaveLength(2); // 1 цвет × 2 размера — реальные ProductVariant, не выдуманные
    const variant48 = variants.find((v) => v.size === "48");
    const variant50 = variants.find((v) => v.size === "50");
    if (!variant48 || !variant50) throw new Error("Варианты 48/50 не создались");

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: `Цех E2E ${suffix}`, contractNumber: `E2E-${suffix}` })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад E2E ${suffix}`, type: "own" })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    // --- 2. Спецификация: черновик → approve → номер → PDF ---
    const draftResponse = await request(httpServer)
      .post("/v1/specifications")
      .set(...authHeader(accessToken))
      .send({
        workshopId: workshop.id,
        productId: product.id,
        items: [
          { productVariantId: variant48.id, quantity: 10, unitPrice: 500 },
          { productVariantId: variant50.id, quantity: 15, unitPrice: 500 },
        ],
      })
      .expect(201);
    const draft = draftResponse.body as SpecificationResponseDto;
    expect(draft.status).toBe("draft");
    expect(draft.specNumber).toBeNull();

    const approvedResponse = await request(httpServer)
      .post(`/v1/specifications/${draft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);
    const approved = approvedResponse.body as SpecificationResponseDto;
    expect(approved.status).toBe("approved");
    expect(approved.specNumber).toBe(1);

    const pdfResponse = await request(httpServer)
      .post(`/v1/specifications/${approved.id}/document`)
      .set(...authHeader(accessToken))
      .expect(201);
    const pdfDocument = pdfResponse.body as DocumentResponseDto;
    expect(pdfDocument.fileUrl).toBeTruthy();

    // Reload persistence — спецификация читается заново теми же значениями.
    const reloadedSpecResponse = await request(httpServer)
      .get(`/v1/specifications/${approved.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const reloadedSpec = reloadedSpecResponse.body as SpecificationResponseDto;
    expect(reloadedSpec.specNumber).toBe(1);
    expect(reloadedSpec.status).toBe("approved");

    // --- 3. Партия из утверждённой спецификации — модель БЕЗ BOM: раньше 400
    // SPECIFICATION_PRODUCT_NORMS_NOT_APPROVED, теперь ensureApproved заводит
    // пустой approved BOM автоматически (BomService.ensureApproved). ---
    const orderResponse = await request(httpServer)
      .post(`/v1/specifications/${approved.id}/production-order`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    expect(order.status).toBe("placed");
    expect(order.specificationId).toBe(approved.id);
    expect(order.bomId).toBeTruthy();
    const [autoBom] = await db.select().from(boms).where(eq(boms.id, order.bomId));
    expect(autoBom?.status).toBe("approved");
    const autoBomItems = await db.select().from(bomItems).where(eq(bomItems.bomId, order.bomId));
    expect(autoBomItems).toHaveLength(0); // Zero Input — пустой BOM, не гейт

    // --- 4. Раскрой партии без норм расхода — раньше 400
    // CUTTING_MATERIAL_NORMS_MISSING, теперь задание создаётся с materials: []. ---
    const cuttingResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cutting-orders`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);
    const cuttingOrder = cuttingResponse.body as CuttingOrderResponseDto;
    expect(cuttingOrder.materials).toEqual([]);
    expect(cuttingOrder.results.map((r) => r.plannedQuantity).sort()).toEqual([10, 15]);

    await request(httpServer)
      .post(`/v1/cutting-orders/${cuttingOrder.id}/issue`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(201);

    // Факт: 48 выкроено на 1 меньше плана (9 из 10) — план не переписывается.
    const cuttingFactResponse = await request(httpServer)
      .post(`/v1/cutting-orders/${cuttingOrder.id}/result`)
      .set(...authHeader(accessToken))
      .send({
        warehouseId: warehouse.id,
        materials: [],
        results: [
          { productVariantId: variant48.id, actualQuantity: 9 },
          { productVariantId: variant50.id, actualQuantity: 15 },
        ],
      })
      .expect(201);
    expect((cuttingFactResponse.body as CuttingFactResponseDto).cuttingOrder.status).toBe("completed");

    // --- 5. Пошив: полная цепочка статусов, включая sewing_completed/shipped_to_fulfillment ---
    for (const status of ["in_progress", "sewing_completed", "ready_for_pickup", "shipped_to_fulfillment"]) {
      const statusResponse = await request(httpServer)
        .post(`/v1/production-orders/${order.id}/status`)
        .set(...authHeader(accessToken))
        .send({ status })
        .expect(201);
      expect((statusResponse.body as ProductionOrderResponseDto).status).toBe(status);
    }

    // --- 6. Приёмка фулфилментом (accept) из shipped_to_fulfillment ---
    const receiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({
        warehouseId: warehouse.id,
        receivedVariants: [
          { productVariantId: variant48.id, quantity: 10 },
          { productVariantId: variant50.id, quantity: 15 },
        ],
      })
      .expect(201);
    expect((receiveResponse.body as ProductionOrderResponseDto).status).toBe("received");

    // --- 7. ОТК с явной причиной брака (defectBreakdown) ---
    const qcResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({
        receivedQuantity: 25,
        goodQuantity: 22,
        defectQuantity: 3,
        defectBreakdown: [{ productVariantId: variant48.id, quantity: 3, reason: "Пятно на ткани" }],
      })
      .expect(201);
    const qc = qcResponse.body as QcResultResponseDto;
    expect(qc.goodQuantity).toBe(22);
    expect(qc.defectQuantity).toBe(3);

    const defectsResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}/defects`)
      .set(...authHeader(accessToken))
      .expect(200);
    const defects = defectsResponse.body as ProductionOrderDefectResponseDto[];
    expect(defects).toHaveLength(1);
    expect(defects[0]?.reason).toBe("Пятно на ткани");
    expect(defects[0]?.productVariantId).toBe(variant48.id);

    // --- 8. Компенсация брака отдельным rework-заказом ---
    const reworkResponse = await request(httpServer)
      .post("/v1/production-orders")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        bomId: order.bomId,
        workshopId: workshop.id,
        plannedQuantity: 3,
        agreedUnitPrice: 0,
        sourceProductionOrderId: order.id,
        variants: [{ productVariantId: variant48.id, quantity: 3, variantType: "rework", unitPrice: 0 }],
      })
      .expect(201);
    const rework = reworkResponse.body as ProductionOrderResponseDto;

    const defectRow = defects[0];
    if (!defectRow) throw new Error("Брак не найден для компенсации");
    const compensationResponse = await request(httpServer)
      .post(`/v1/defects/${defectRow.id}/compensations`)
      .set(...authHeader(accessToken))
      .send({ compensatingProductionOrderId: rework.id, quantity: 3 })
      .expect(201);
    expect((compensationResponse.body as DefectCompensationResponseDto).quantity).toBe(3);

    const defectSummaryResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}/defect-summary`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect(defectSummaryResponse.body).toMatchObject({ defectQuantity: 3, compensatedQuantity: 3, remainingToCompensate: 0 });

    // --- 9. Фулфилмент видит партию после shipped_to_fulfillment/received ---
    const fulfillmentResponse = await request(httpServer)
      .get("/v1/fulfillment/batches")
      .set(...authHeader(accessToken))
      .expect(200);
    const fulfillmentBatches = (fulfillmentResponse.body as FulfillmentBatchListResponseDto).items;
    const ourBatch = fulfillmentBatches.find((row) => row.productionOrderId === order.id);
    expect(ourBatch).toBeTruthy();
    expect(ourBatch?.specNumber).toBe(1);
    expect(ourBatch?.qcStatus).toBe("qc_recorded");

    // --- 10. Завершение партии — терминальный статус, всё ещё видно после reload ---
    const completeResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/complete`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((completeResponse.body as ProductionOrderResponseDto).status).toBe("completed");

    const finalOrderResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((finalOrderResponse.body as ProductionOrderResponseDto).status).toBe("completed");

    const [finishedGoodsStock] = await db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouse.id), eq(stockItems.productVariantId, variant48.id)));
    expect(Number(finishedGoodsStock?.quantityOnHand)).toBe(10);
  });
});
