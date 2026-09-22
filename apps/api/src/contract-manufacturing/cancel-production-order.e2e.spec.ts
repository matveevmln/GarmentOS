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
  CuttingOrderResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  SpecificationResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { addUserToCompany, authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

// Отмена заказа пошива (владелец проекта, 2026-09-22) — матрица утверждена
// владельцем проекта перед реализацией (draft/placed/received-без-фактов/
// received-с-фактами/shipped_to_fulfillment/completed/cancelled/QC-exists).
// Одна общая компания на весь файл (не по компании на тест, как в других
// *.e2e.spec.ts здесь) — намеренное отступление от обычного паттерна:
// POST /v1/auth/login троттлится 5 запросами/60с на приложение
// (auth.controller.ts), а этому файлу нужно ~10 сценариев; по компании на
// тест почти гарантированно упёрлось бы в 429 внутри одного 60-секундного
// окна. Каждый тест создаёт СВОЙ заказ под общим владельцем — изоляция
// сценариев обеспечивается на уровне заказа, не компании.
describe("Отмена заказа пошива — POST /production-orders/:id/cancel (владелец проекта, 2026-09-22)", () => {
  let app: INestApplication;
  let httpServer: Server;
  let companyName: string;
  let companyId: string;
  let ownerToken: string;
  let product: ProductResponseDto;
  let variant: ProductVariantResponseDto;
  let workshop: WorkshopResponseDto;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;

    companyName = `E2E Cancel Production Order ${Date.now()}`;
    const auth = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");
    companyId = auth.companyId;
    ownerToken = auth.accessToken;

    const suffix = `${Date.now()}`;
    product = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(ownerToken))
        .send({ name: `Отмена заказа ${suffix}`, code: `CANCEL-${suffix}` })
        .expect(201)
    ).body as ProductResponseDto;
    variant = (
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(ownerToken))
        .send({ productId: product.id, size: "ONE SIZE", color: "Чёрный", skuCode: `CANCEL-${suffix}-BLACK` })
        .expect(201)
    ).body as ProductVariantResponseDto;
    workshop = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(ownerToken))
        .send({ name: `Цех отмены ${suffix}`, contractNumber: `Д-CNL-${suffix}` })
        .expect(201)
    ).body as WorkshopResponseDto;
  });

  afterAll(async () => {
    const [company] = await db.select().from(companies).where(eq(companies.name, companyName));
    if (company) {
      const companySpecs = await db.select().from(specifications).where(eq(specifications.companyId, company.id));
      for (const spec of companySpecs) {
        await db.delete(specificationItems).where(eq(specificationItems.specificationId, spec.id));
      }
      await db.delete(specifications).where(eq(specifications.companyId, company.id));
      const companyOrders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company.id));
      for (const order of companyOrders) {
        const orderCuttingOrders = await db.select().from(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
        for (const cuttingOrder of orderCuttingOrders) {
          await db.delete(cuttingOrderMaterials).where(eq(cuttingOrderMaterials.cuttingOrderId, cuttingOrder.id));
          await db.delete(cuttingOrderResults).where(eq(cuttingOrderResults.cuttingOrderId, cuttingOrder.id));
        }
        await db.delete(cuttingOrders).where(eq(cuttingOrders.productionOrderId, order.id));
        await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
        await db.delete(productionOrderDefects).where(eq(productionOrderDefects.productionOrderId, order.id));
        await db.delete(productionOrderQcResults).where(eq(productionOrderQcResults.productionOrderId, order.id));
      }
      await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
      await db.delete(workshops).where(eq(workshops.companyId, company.id));
      const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
      for (const warehouse of companyWarehouses) {
        const items = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        for (const item of items) {
          await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
        }
        await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
      }
      await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
      const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
      for (const bom of companyBoms) {
        await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
      }
      await db.delete(boms).where(eq(boms.companyId, company.id));
      const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
      for (const p of companyProducts) {
        await db.delete(productVariants).where(eq(productVariants.productId, p.id));
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
    await app.close();
  });

  async function createDraftOrder(quantity = 10): Promise<ProductionOrderResponseDto> {
    return (
      await request(httpServer)
        .post("/v1/production-orders")
        .set(...authHeader(ownerToken))
        .send({
          productId: product.id,
          workshopId: workshop.id,
          plannedQuantity: quantity,
          agreedUnitPrice: 500,
          variants: [{ productVariantId: variant.id, quantity }],
        })
        .expect(201)
    ).body as ProductionOrderResponseDto;
  }

  async function advanceToShippedToFulfillment(orderId: string): Promise<void> {
    await request(httpServer)
      .post(`/v1/production-orders/${orderId}/confirm`)
      .set(...authHeader(ownerToken))
      .expect(201);
    for (const status of ["in_progress", "sewing_completed", "ready_for_pickup", "shipped_to_fulfillment"] as const) {
      await request(httpServer)
        .post(`/v1/production-orders/${orderId}/status`)
        .set(...authHeader(ownerToken))
        .send({ status })
        .expect(201);
    }
  }

  it("draft: отмена проходит, статус меняется и переживает reload, пишется аудит-запись", async () => {
    const order = await createDraftOrder();

    const cancelResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "Заказ создан по ошибке" })
      .expect(201);
    expect((cancelResponse.body as ProductionOrderResponseDto).status).toBe("cancelled");

    const reloaded = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(ownerToken))
      .expect(200);
    expect((reloaded.body as ProductionOrderResponseDto).status).toBe("cancelled");

    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, order.id), eq(auditLog.action, "production_order.cancelled")));
    expect(auditEntries).toHaveLength(1);
    expect((auditEntries[0]?.afterJson as { reason?: string } | null)?.reason).toBe("Заказ создан по ошибке");
  });

  it("placed с эксклюзивной NEW-поток спецификацией и раскройным заданием (draft) — отмена каскадно закрывает обе сущности", async () => {
    const order = await createDraftOrder();
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(ownerToken))
      .expect(201);

    const spec = (
      await request(httpServer)
        .post(`/v1/production-orders/${order.id}/specification`)
        .set(...authHeader(ownerToken))
        .expect(201)
    ).body as SpecificationResponseDto;

    const cuttingOrder = (
      await request(httpServer)
        .post(`/v1/production-orders/${order.id}/cutting-orders`)
        .set(...authHeader(ownerToken))
        .send({})
        .expect(201)
    ).body as CuttingOrderResponseDto;
    expect(cuttingOrder.status).toBe("draft");

    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "Цех отказался от заказа" })
      .expect(201);

    const reloadedSpec = await request(httpServer)
      .get(`/v1/specifications/${spec.id}`)
      .set(...authHeader(ownerToken))
      .expect(200);
    expect((reloadedSpec.body as SpecificationResponseDto).status).toBe("cancelled");

    const reloadedCuttingOrder = await request(httpServer)
      .get(`/v1/cutting-orders/${cuttingOrder.id}`)
      .set(...authHeader(ownerToken))
      .expect(200);
    expect((reloadedCuttingOrder.body as CuttingOrderResponseDto).status).toBe("cancelled");
  });

  it("shipped_to_fulfillment: отмена разрешена явным правилом, физических фактов на этой стадии ещё нет", async () => {
    const order = await createDraftOrder();
    await advanceToShippedToFulfillment(order.id);

    const cancelResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "Партия отзывается до приёмки" })
      .expect(201);
    expect((cancelResponse.body as ProductionOrderResponseDto).status).toBe("cancelled");
  });

  it("received без факта приёмки (легаси-состояние без markReceived) — отмена разрешена", async () => {
    const order = await createDraftOrder();
    await advanceToShippedToFulfillment(order.id);

    // Тот же приём, что и в тесте отката статуса (received без факта
    // приёмки достижим сегодня только легаси-переходом в обход /receive) —
    // db.update напрямую, receivedQuantity у вариантов остаётся null.
    await db.update(productionOrders).set({ status: "received" }).where(eq(productionOrders.id, order.id));

    const cancelResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "Приёмка отмечена ошибочно" })
      .expect(201);
    expect((cancelResponse.body as ProductionOrderResponseDto).status).toBe("cancelled");
  });

  it("received с реальным фактом приёмки (остаток уже зачислен на склад) — отмена заблокирована", async () => {
    const order = await createDraftOrder();
    await advanceToShippedToFulfillment(order.id);

    const warehouse = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(ownerToken))
        .send({ name: `Склад отмены ${Date.now()}` })
        .expect(201)
    ).body as { id: string };
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(ownerToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);

    const cancelResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "тест" })
      .expect(409);
    expect((cancelResponse.body as { code: string }).code).toBe("PRODUCTION_ORDER_CANCEL_RECEIVED_FACTS_EXIST");

    const reloaded = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(ownerToken))
      .expect(200);
    expect((reloaded.body as ProductionOrderResponseDto).status).toBe("received");
  });

  it("результат ОТК уже зафиксирован — отмена заблокирована независимо от статуса", async () => {
    const order = await createDraftOrder();
    await advanceToShippedToFulfillment(order.id);

    const warehouse = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(ownerToken))
        .send({ name: `Склад ОТК ${Date.now()}` })
        .expect(201)
    ).body as { id: string };
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(ownerToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/qc`)
      .set(...authHeader(ownerToken))
      .send({ receivedQuantity: 10, goodQuantity: 9, defectQuantity: 1 })
      .expect(201);

    const cancelResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "тест" })
      .expect(409);
    expect((cancelResponse.body as { code: string }).code).toBe("PRODUCTION_ORDER_CANCEL_QC_EXISTS");
  });

  it("completed: отмена заблокирована (правило — нельзя отменить completed)", async () => {
    const order = await createDraftOrder();
    await advanceToShippedToFulfillment(order.id);

    const warehouse = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(ownerToken))
        .send({ name: `Склад completed ${Date.now()}` })
        .expect(201)
    ).body as { id: string };
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/receive`)
      .set(...authHeader(ownerToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/complete`)
      .set(...authHeader(ownerToken))
      .expect(201);

    const cancelResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "тест" })
      .expect(409);
    expect((cancelResponse.body as { code: string }).code).toBe("PRODUCTION_ORDER_CANCEL_FROM_COMPLETED");
  });

  it("cancelled: повторная отмена уже отменённого заказа заблокирована (идемпотентный отказ)", async () => {
    const order = await createDraftOrder();
    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "Первая отмена" })
      .expect(201);

    const secondAttempt = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "Вторая попытка" })
      .expect(409);
    expect((secondAttempt.body as { code: string }).code).toBe("PRODUCTION_ORDER_ALREADY_CANCELLED");
  });

  it("пустая причина отклоняется на уровне схемы — 400", async () => {
    const order = await createDraftOrder();

    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(ownerToken))
      .send({ reason: "" })
      .expect(400);

    const reloaded = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(ownerToken))
      .expect(200);
    expect((reloaded.body as ProductionOrderResponseDto).status).toBe("draft");
  });

  it("RBAC: роль с contract_manufacturing.write, но без contract_manufacturing.cancel — 403", async () => {
    const order = await createDraftOrder();

    // procurement_manager имеет contract_manufacturing.write (может создавать
    // и подтверждать заказы), но не contract_manufacturing.cancel (миграция
    // 0034, только owner/director) — именно это должна проверять RBAC-защита
    // отмены, а не просто "нет вообще никаких прав".
    const procurementManager = await addUserToCompany(db, httpServer, companyId, "procurement_manager");

    await request(httpServer)
      .post(`/v1/production-orders/${order.id}/cancel`)
      .set(...authHeader(procurementManager.accessToken))
      .send({ reason: "Попытка без права" })
      .expect(403);

    const reloaded = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(ownerToken))
      .expect(200);
    expect((reloaded.body as ProductionOrderResponseDto).status).toBe("draft");
  });
});
