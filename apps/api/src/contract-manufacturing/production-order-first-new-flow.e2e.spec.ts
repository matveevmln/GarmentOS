import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  boms,
  bomItems,
  companies,
  createDb,
  documentDerivatives,
  documentLinks,
  documents,
  numericValuePresets,
  productionOrderDefects,
  productionOrderQcResults,
  productionOrders,
  productionOrderVariants,
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
  FulfillmentBatchListResponseDto,
  PresetResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  QcResultResponseDto,
  SpecificationResponseDto,
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

// ПРОМПТ №3 — полный happy path новой цепочки:
// Модель → Заказ на пошив (без BOM/материалов) → Спецификация из заказа →
// редактирование → PDF → in_progress → sewing_completed → ready_for_pickup →
// shipped_to_fulfillment → received → ОТК → rollback → Фулфилмент ОТК.
// Отдельный файл — собственный экземпляр приложения (свой rate-limit
// /auth/login), тот же паттерн, что и остальные *.e2e.spec.ts здесь.
describe("Production Order → Specification — новая цепочка целиком (ПРОМПТ №3, e2e)", () => {
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
        const companySpecs = await db.select().from(specifications).where(eq(specifications.companyId, company.id));
        for (const spec of companySpecs) {
          await db.delete(specificationItems).where(eq(specificationItems.specificationId, spec.id));
        }
        await db.delete(specifications).where(eq(specifications.companyId, company.id));
        const companyOrders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company.id));
        for (const order of companyOrders) {
          await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
          await db.delete(productionOrderDefects).where(eq(productionOrderDefects.productionOrderId, order.id));
          await db.delete(productionOrderQcResults).where(eq(productionOrderQcResults.productionOrderId, order.id));
        }
        await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
        await db.delete(numericValuePresets).where(eq(numericValuePresets.companyId, company.id));
        const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
        for (const document of companyDocuments) {
          await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, document.id));
          await db.delete(documentLinks).where(eq(documentLinks.documentId, document.id));
        }
        await db.delete(documents).where(eq(documents.companyId, company.id));
        await db.delete(workshops).where(eq(workshops.companyId, company.id));
        const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
        for (const bom of companyBoms) {
          await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
        }
        await db.delete(boms).where(eq(boms.companyId, company.id));
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

  it("Модель → заказ без BOM → спецификация из заказа → правка → PDF → статусы → ОТК → rollback → фулфилмент", async () => {
    const companyName = `E2E New Flow ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    const suffix = `${Date.now()}`;

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: `Стеганка Новый Поток ${suffix}`, code: `NEWFLOW-${suffix}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantS = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "48-50", color: "Графит", skuCode: `NEWFLOW-${suffix}-S` })
      .expect(201);
    const variantL = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "52-54", color: "Графит", skuCode: `NEWFLOW-${suffix}-L` })
      .expect(201);
    const variant1 = variantS.body as ProductVariantResponseDto;
    const variant2 = variantL.body as ProductVariantResponseDto;

    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({
        name: `Ак-Сарай ${suffix}`,
        contractNumber: `П-${suffix}`,
        contractDate: "2026-04-22",
        legalAddress: "Кыргызская республика, город Бишкек",
      })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: `Склад ${suffix}` })
      .expect(201);
    const warehouse = warehouseResponse.body as { id: string };

    // 1. Пресеты — сразу видны дефолтные значения без ручного создания.
    const presetsResponse = await request(httpServer)
      .get("/v1/presets?kind=sewing_cost")
      .set(...authHeader(accessToken))
      .expect(200);
    const presets = presetsResponse.body as PresetResponseDto[];
    expect(presets.map((p) => p.value)).toEqual(expect.arrayContaining(["350.00", "380.00", "450.00"]));

    // 2. Заказ на пошив БЕЗ выбора BOM/материалов (ПРОМПТ №3, раздел 8) —
    // равномерное распределение по размерам ("Равномерно").
    const orderResponse = await request(httpServer)
      .post("/v1/production-orders/from-quantity")
      .set(...authHeader(accessToken))
      .send({
        productId: product.id,
        workshopId: workshop.id,
        totalQuantity: 100,
        agreedUnitPrice: presets.find((p) => p.value === "450.00")?.value ? 450 : 450,
        distributionMode: "even",
      })
      .expect(201);
    const order = orderResponse.body as ProductionOrderResponseDto;
    expect(order.status).toBe("draft");
    expect(order.bomId).toBeTruthy(); // авто-заведённый пустой BOM, невидимый пользователю
    const orderVariantQuantities = order.variants.map((v) => Number(v.quantity)).sort((a, b) => a - b);
    expect(orderVariantQuantities).toEqual([50, 50]); // even между двумя размерами

    // 3. Подтверждение заказа (замораживает Snapshot).
    const confirmResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((confirmResponse.body as ProductionOrderResponseDto).status).toBe("placed");

    // 4. Спецификация СОЗДАЁТСЯ ИЗ заказа (не наоборот) — без approve/freeze.
    const specResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/specification`)
      .set(...authHeader(accessToken))
      .expect(201);
    const spec = specResponse.body as SpecificationResponseDto;
    expect(spec.productionOrderId).toBe(order.id);
    expect(spec.status).toBe("approved");
    expect(spec.specNumber).not.toBeNull();
    expect(spec.items).toHaveLength(2);

    // Повторное создание для того же заказа запрещено (1:1).
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/specification`)
      .set(...authHeader(accessToken))
      .expect(400);

    // 5. Редактирование спецификации — НЕ пишет обратно в заказ.
    const updateResponse = await request(httpServer)
      .patch(`/v1/specifications/${spec.id}`)
      .set(...authHeader(accessToken))
      .send({
        items: [
          { productVariantId: variant1.id, quantity: 60, unitPrice: 700 },
          { productVariantId: variant2.id, quantity: 40, unitPrice: 700 },
        ],
      })
      .expect(200);
    const updatedSpec = updateResponse.body as SpecificationResponseDto;
    expect(updatedSpec.totalQuantity).toBe("100.000");
    expect(updatedSpec.version).toBe(2);

    const orderAfterSpecEdit = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    const orderAfterSpecEditQuantities = (orderAfterSpecEdit.body as ProductionOrderResponseDto).variants
      .map((v) => Number(v.quantity))
      .sort((a, b) => a - b);
    expect(orderAfterSpecEditQuantities).toEqual([50, 50]); // заказ не изменился

    // 6. PDF формируется из ТЕКУЩЕГО состояния спецификации (не snapshot).
    const documentResponse = await request(httpServer)
      .post(`/v1/specifications/${spec.id}/document`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((documentResponse.body as { docType: string }).docType).toBe("specification");

    // 7. Статусы новой линейки — явные переходы пользователя, каждый отдельно.
    for (const status of ["in_progress", "sewing_completed", "ready_for_pickup", "shipped_to_fulfillment"] as const) {
      const statusResponse = await request(httpServer)
        .post(`/v1/production-orders/${order.id}/status`)
        .set(...authHeader(accessToken))
        .send({ status })
        .expect(201);
      expect((statusResponse.body as ProductionOrderResponseDto).status).toBe(status);
    }

    // 8. Фулфилмент ОТК показывает партию, ещё без результата.
    const fulfillmentBeforeQc = await request(httpServer)
      .get("/v1/fulfillment/batches")
      .set(...authHeader(accessToken))
      .expect(200);
    const batchBeforeQc = (fulfillmentBeforeQc.body as FulfillmentBatchListResponseDto).items.find(
      (item) => item.productionOrderId === order.id,
    );
    expect(batchBeforeQc?.qcStatus).toBe("awaiting_qc");
    expect(batchBeforeQc?.specNumber).toBe(spec.specNumber);

    // 9. Приёмка на склад — доступна и из shipped_to_fulfillment.
    const receiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);
    expect((receiveResponse.body as ProductionOrderResponseDto).status).toBe("received");

    // 10. Результат ОТК — не закрывает партию автоматически.
    const qcResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(accessToken))
      .send({ receivedQuantity: 100, goodQuantity: 93, defectQuantity: 7 })
      .expect(201);
    expect((qcResponse.body as QcResultResponseDto).defectQuantity).toBe(7);

    const orderAfterQc = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((orderAfterQc.body as ProductionOrderResponseDto).status).toBe("received"); // не изменился сам по себе

    const fulfillmentAfterQc = await request(httpServer)
      .get("/v1/fulfillment/batches")
      .set(...authHeader(accessToken))
      .expect(200);
    const batchAfterQc = (fulfillmentAfterQc.body as FulfillmentBatchListResponseDto).items.find(
      (item) => item.productionOrderId === order.id,
    );
    expect(batchAfterQc?.qcStatus).toBe("qc_recorded");
    expect(batchAfterQc?.defectQuantity).toBe("7");

    // 11. Rollback запрещён — уже есть результат ОТК.
    const forbiddenRollback = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/rollback-status`)
      .set(...authHeader(accessToken))
      .send({ reason: "тест" })
      .expect(409);
    expect((forbiddenRollback.body as { code: string }).code).toBe("PRODUCTION_ORDER_ROLLBACK_QC_EXISTS");

    // 12. Завершение партии — отдельное явное действие.
    const completeResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/complete`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((completeResponse.body as ProductionOrderResponseDto).status).toBe("completed");

    const rollbackAuditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, order.id), eq(auditLog.action, "production_order.status_rolled_back")));
    expect(rollbackAuditEntries).toHaveLength(0); // rollback был отклонён, записи быть не должно
  });
});
