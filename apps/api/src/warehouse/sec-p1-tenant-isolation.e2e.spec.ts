import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  companies,
  createDb,
  inventoryCountItems,
  inventoryCounts,
  productVariants,
  products,
  refreshTokens,
  shipmentItems,
  shipments,
  stockItems,
  stockMovements,
  userRoles,
  users,
  warehouses,
} from "@garmentos/db-schema";
import type {
  ProductResponseDto,
  ProductVariantResponseDto,
  ShipmentResponseDto,
  StockItemResponseDto,
  TransferStockResponseDto,
  WarehouseResponseDto,
} from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

// SEC-P1 (docs/tasks/SEC-P1.md) — изоляция компаний в складских операциях и
// отгрузках. Воспроизведён в docs/GOS-PARTY-V1-AUDIT.md, раздел 12 (сценарий
// P1): компания B могла записать остаток на склад компании A и использовать
// чужой SKU, зная только его UUID. Этот файл — постоянный regression-тест,
// не временный зонд: без исправления (packages/domain/warehouse/src/
// application/{receive,dispatch,transfer}-stock.ts, reservation.ts,
// create-shipment.ts, dispatch-shipment.ts, mark-shipment-delivered.ts,
// record-inventory-count-item.ts) большинство блоков ниже падают —
// подтверждено вручную (см. docs/reports/SEC-P1.md, раздел «Красный прогон»)
// откатом этих файлов и повторным запуском этого же теста.
//
// Все проверки идут через реальный HTTP + JWT (supertest + AppModule), не
// прямой вызов service/use case с вручную подставленным companyId — только
// так виден полный путь controller → service → domain, включая guard'ы.
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

  const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
  for (const warehouse of companyWarehouses) {
    const items = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
    for (const item of items) {
      await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
    }
    await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
    const counts = await db.select().from(inventoryCounts).where(eq(inventoryCounts.warehouseId, warehouse.id));
    for (const count of counts) {
      await db.delete(inventoryCountItems).where(eq(inventoryCountItems.inventoryCountId, count.id));
    }
    await db.delete(inventoryCounts).where(eq(inventoryCounts.warehouseId, warehouse.id));
  }

  const companyShipments = await db.select().from(shipments).where(eq(shipments.companyId, company.id));
  for (const shipment of companyShipments) {
    await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipment.id));
  }
  await db.delete(shipments).where(eq(shipments.companyId, company.id));

  await db.delete(warehouses).where(eq(warehouses.companyId, company.id));

  const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
  for (const product of companyProducts) {
    await db.delete(productVariants).where(eq(productVariants.productId, product.id));
  }
  await db.delete(products).where(eq(products.companyId, company.id));

  const companyUsers = await db.select().from(users).where(eq(users.companyId, company.id));
  for (const user of companyUsers) {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
    await db.delete(userRoles).where(eq(userRoles.userId, user.id));
  }
  await db.delete(users).where(eq(users.companyId, company.id));
  await db.delete(companies).where(eq(companies.id, company.id));
}

describe("SEC-P1: изоляция компаний в складе и отгрузках (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  const createdCompanyNames: string[] = [];

  // Контекст компании A и B, общий для всех it() ниже — создание двух
  // полноценных компаний с моделями/складами в каждом it() было бы дорого и
  // избыточно; сценарии независимы по данным (свои SKU/склады на кейс), но
  // используют общие токены.
  let companyA: { companyId: string; userId: string; accessToken: string };
  let companyB: { companyId: string; userId: string; accessToken: string };
  let warehouseA: WarehouseResponseDto;
  let warehouseA2: WarehouseResponseDto;
  let warehouseB: WarehouseResponseDto;
  let warehouseB2: WarehouseResponseDto;
  let variantA: ProductVariantResponseDto;
  let variantB: ProductVariantResponseDto;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;

    const suffix = Date.now();
    const companyNameA = `SEC-P1 Company A ${suffix}`;
    const companyNameB = `SEC-P1 Company B ${suffix}`;
    createdCompanyNames.push(companyNameA, companyNameB);

    companyA = await setupAuthenticatedCompany(db, httpServer, companyNameA, "owner");
    companyB = await setupAuthenticatedCompany(db, httpServer, companyNameB, "owner");

    const productAResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(companyA.accessToken))
      .send({ name: "Худи A", code: `SEC-P1-A-${suffix}` })
      .expect(201);
    const productA = productAResponse.body as ProductResponseDto;
    const variantAResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(companyA.accessToken))
      .send({ productId: productA.id, size: "M", color: "Чёрный", skuCode: `SEC-P1-A-${suffix}-M` })
      .expect(201);
    variantA = variantAResponse.body as ProductVariantResponseDto;

    const productBResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(companyB.accessToken))
      .send({ name: "Худи B", code: `SEC-P1-B-${suffix}` })
      .expect(201);
    const productB = productBResponse.body as ProductResponseDto;
    const variantBResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(companyB.accessToken))
      .send({ productId: productB.id, size: "M", color: "Белый", skuCode: `SEC-P1-B-${suffix}-M` })
      .expect(201);
    variantB = variantBResponse.body as ProductVariantResponseDto;

    warehouseA = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(companyA.accessToken))
        .send({ name: "Склад A", type: "own" })
        .expect(201)
    ).body as WarehouseResponseDto;
    warehouseA2 = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(companyA.accessToken))
        .send({ name: "Склад A-2", type: "own" })
        .expect(201)
    ).body as WarehouseResponseDto;
    warehouseB = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(companyB.accessToken))
        .send({ name: "Склад B", type: "own" })
        .expect(201)
    ).body as WarehouseResponseDto;
    warehouseB2 = (
      await request(httpServer)
        .post("/v1/warehouses")
        .set(...authHeader(companyB.accessToken))
        .send({ name: "Склад B-2", type: "own" })
        .expect(201)
    ).body as WarehouseResponseDto;

    // На складе A есть законный остаток компании A — именно его пытается
    // задеть компания B во всех сценариях ниже.
    await request(httpServer)
      .post("/v1/stock/receive")
      .set(...authHeader(companyA.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantA.id, quantity: 100 })
      .expect(201);
  });

  afterAll(async () => {
    for (const name of createdCompanyNames) await cleanupCompany(name);
    await app.close();
  });

  // ---- 1: воспроизведение исходного P1 и подтверждение исправления ----
  it("P1: компания B не может записать приёмку на склад компании A", async () => {
    const response = await request(httpServer)
      .post("/v1/stock/receive")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantB.id, quantity: 5 })
      .expect(404);
    expect((response.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    // Остаток A не изменился — до исправления здесь появлялось +5 (см.
    // docs/GOS-PARTY-V1-AUDIT.md, раздел 12, P1: "HTTP 201, на складе A
    // появился остаток 5.000 SKU компании B").
    const stockCheck = await request(httpServer)
      .post("/v1/stock/reserve")
      .set(...authHeader(companyA.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantA.id, quantity: 100 })
      .expect(201);
    expect((stockCheck.body as StockItemResponseDto).quantityOnHand).toBe("100.000");
    // Возвращаем в исходное состояние для остальных сценариев.
    await request(httpServer)
      .post("/v1/stock/release")
      .set(...authHeader(companyA.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantA.id, quantity: 100 })
      .expect(201);
  });

  // ---- 2: чужой SKU на своём складе ----
  it("не позволяет использовать чужой SKU на своём складе (receive/dispatch/transfer)", async () => {
    const receiveResponse = await request(httpServer)
      .post("/v1/stock/receive")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseB.id, productVariantId: variantA.id, quantity: 5 })
      .expect(404);
    expect((receiveResponse.body as ErrorResponseBody).code).toBe("PRODUCT_VARIANT_NOT_FOUND");

    const dispatchResponse = await request(httpServer)
      .post("/v1/stock/dispatch")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseB.id, productVariantId: variantA.id, quantity: 1 })
      .expect(404);
    expect((dispatchResponse.body as ErrorResponseBody).code).toBe("PRODUCT_VARIANT_NOT_FOUND");

    const transferResponse = await request(httpServer)
      .post("/v1/stock/transfer")
      .set(...authHeader(companyB.accessToken))
      .send({ originWarehouseId: warehouseB.id, destinationWarehouseId: warehouseB2.id, productVariantId: variantA.id, quantity: 1 })
      .expect(404);
    expect((transferResponse.body as ErrorResponseBody).code).toBe("PRODUCT_VARIANT_NOT_FOUND");
  });

  // ---- P1 продолжение: dispatch/transfer/reserve/release чужого склада ----
  it("не позволяет списать, переместить, зарезервировать или снять резерв на чужом складе", async () => {
    const dispatchResponse = await request(httpServer)
      .post("/v1/stock/dispatch")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantB.id, quantity: 1 })
      .expect(404);
    expect((dispatchResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    // Источник свой, назначение чужое.
    const transferToForeignResponse = await request(httpServer)
      .post("/v1/stock/transfer")
      .set(...authHeader(companyB.accessToken))
      .send({ originWarehouseId: warehouseB.id, destinationWarehouseId: warehouseA.id, productVariantId: variantB.id, quantity: 1 })
      .expect(404);
    expect((transferToForeignResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    // Источник чужой, назначение своё.
    const transferFromForeignResponse = await request(httpServer)
      .post("/v1/stock/transfer")
      .set(...authHeader(companyB.accessToken))
      .send({ originWarehouseId: warehouseA.id, destinationWarehouseId: warehouseB.id, productVariantId: variantB.id, quantity: 1 })
      .expect(404);
    expect((transferFromForeignResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    const reserveResponse = await request(httpServer)
      .post("/v1/stock/reserve")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantB.id, quantity: 1 })
      .expect(404);
    expect((reserveResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    const releaseResponse = await request(httpServer)
      .post("/v1/stock/release")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantB.id, quantity: 1 })
      .expect(404);
    expect((releaseResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    // Остаток A остался нетронутым — прямая проверка через БД (не только
    // отсутствие успеха в ответе).
    const [stockRow] = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.warehouseId, warehouseA.id));
    expect(stockRow?.quantityOnHand).toBe("100.000");
    expect(stockRow?.quantityReserved).toBe("0.000");
  });

  // ---- 3: многопозиционный запрос — первая строка своя, последняя чужая ----
  it("отклоняет создание отгрузки целиком, если хотя бы одна позиция чужая (первая своя, последняя чужая)", async () => {
    const shipmentsBefore = await db.select().from(shipments).where(eq(shipments.companyId, companyB.companyId));

    const response = await request(httpServer)
      .post("/v1/shipments")
      .set(...authHeader(companyB.accessToken))
      .send({
        originWarehouseId: warehouseB.id,
        destinationWarehouseId: warehouseB2.id,
        items: [
          { productVariantId: variantB.id, quantity: 1 }, // своя — допустима сама по себе
          { productVariantId: variantA.id, quantity: 1 }, // чужая — последняя строка
        ],
      })
      .expect(404);
    expect((response.body as ErrorResponseBody).code).toBe("PRODUCT_VARIANT_NOT_FOUND");

    // Ни строка, ни сама отгрузка не создались — количество отгрузок B не
    // изменилось (docs/tasks/SEC-P1.md, пункт 3: "количества, резервы,
    // движения, строки и состояния отгрузок не меняются").
    const shipmentsAfter = await db.select().from(shipments).where(eq(shipments.companyId, companyB.companyId));
    expect(shipmentsAfter.length).toBe(shipmentsBefore.length);
  });

  it("отклоняет создание отгрузки с чужим складом источника или назначения", async () => {
    const originResponse = await request(httpServer)
      .post("/v1/shipments")
      .set(...authHeader(companyB.accessToken))
      .send({ originWarehouseId: warehouseA.id, destinationWarehouseId: warehouseB.id, items: [{ productVariantId: variantB.id, quantity: 1 }] })
      .expect(404);
    expect((originResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    const destinationResponse = await request(httpServer)
      .post("/v1/shipments")
      .set(...authHeader(companyB.accessToken))
      .send({ originWarehouseId: warehouseB.id, destinationWarehouseId: warehouseA.id, items: [{ productVariantId: variantB.id, quantity: 1 }] })
      .expect(404);
    expect((destinationResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");
  });

  // ---- 5: чужая отгрузка и синтетическая старая отгрузка с чужими ссылками ----
  it("не позволяет отправить/получить отгрузку другой компании", async () => {
    const shipmentA = (
      await request(httpServer)
        .post("/v1/shipments")
        .set(...authHeader(companyA.accessToken))
        .send({ originWarehouseId: warehouseA.id, destinationWarehouseId: warehouseA2.id, items: [{ productVariantId: variantA.id, quantity: 1 }] })
        .expect(201)
    ).body as ShipmentResponseDto;

    const dispatchAsB = await request(httpServer)
      .post(`/v1/shipments/${shipmentA.id}/dispatch`)
      .set(...authHeader(companyB.accessToken))
      .expect(404);
    expect((dispatchAsB.body as ErrorResponseBody).code).toBe("SHIPMENT_NOT_FOUND");

    const deliverAsB = await request(httpServer)
      .post(`/v1/shipments/${shipmentA.id}/deliver`)
      .set(...authHeader(companyB.accessToken))
      .expect(404);
    expect((deliverAsB.body as ErrorResponseBody).code).toBe("SHIPMENT_NOT_FOUND");
  });

  it("не исполняет синтетическую старую отгрузку с чужими ссылками на склад (легаси-запись до исправления)", async () => {
    // createShipment теперь отклонил бы такую запись — эмулируем состояние
    // "заведено до исправления" прямой вставкой в БД в обход use case, как
    // требует docs/tasks/SEC-P1.md, пункт 5.
    const [legacyShipment] = await db
      .insert(shipments)
      .values({
        companyId: companyB.companyId,
        originWarehouseId: warehouseA.id, // чужой склад — до исправления такое можно было создать через API
        destinationWarehouseId: warehouseB.id,
        status: "planned",
      })
      .returning();
    if (!legacyShipment) throw new Error("Не удалось создать синтетическую легаси-отгрузку");
    await db.insert(shipmentItems).values({ shipmentId: legacyShipment.id, productVariantId: variantB.id, quantity: "1" });

    const dispatchResponse = await request(httpServer)
      .post(`/v1/shipments/${legacyShipment.id}/dispatch`)
      .set(...authHeader(companyB.accessToken))
      .expect(404);
    expect((dispatchResponse.body as ErrorResponseBody).code).toBe("WAREHOUSE_NOT_FOUND");

    // Остаток A по-прежнему не тронут, статус отгрузки не изменился.
    const [stockRow] = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseA.id));
    expect(stockRow?.quantityOnHand).toBe("100.000");
    const [reloadedShipment] = await db.select().from(shipments).where(eq(shipments.id, legacyShipment.id));
    expect(reloadedShipment?.status).toBe("planned");

    await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, legacyShipment.id));
    await db.delete(shipments).where(eq(shipments.id, legacyShipment.id));
  });

  // ---- 4: нельзя прочитать чужие остатки/отгрузку через существующие входы ----
  it("не предоставляет чтение отгрузок (эндпоинта нет — 404, не разграничение доступа)", async () => {
    // GET /v1/shipments отсутствует в API вообще (docs/GOS-PARTY-V1-AUDIT.md,
    // раздел 14.2) — фиксируем это явно, а не изображаем проверку доступа.
    await request(httpServer)
      .get("/v1/shipments")
      .set(...authHeader(companyB.accessToken))
      .expect(404);
  });

  // ---- инвентаризация: чужой SKU на своём складе ----
  it("не позволяет записать позицию инвентаризации по чужому SKU", async () => {
    const countResponse = await request(httpServer)
      .post("/v1/inventory-counts")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseB.id })
      .expect(201);
    const count = countResponse.body as { id: string };

    const itemResponse = await request(httpServer)
      .post(`/v1/inventory-counts/${count.id}/items`)
      .set(...authHeader(companyB.accessToken))
      .send({ productVariantId: variantA.id, actualQuantity: 5 })
      .expect(404);
    expect((itemResponse.body as ErrorResponseBody).code).toBe("PRODUCT_VARIANT_NOT_FOUND");

    // На складе B не появилось строки остатка по чужому SKU.
    const foreignStockOnB = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.warehouseId, warehouseB.id));
    expect(foreignStockOnB.find((row) => row.productVariantId === variantA.id)).toBeUndefined();
  });

  // ---- 6: подмена автора в теле запроса ----
  it("игнорирует createdBy из тела запроса — движение записывается от реального пользователя", async () => {
    await request(httpServer)
      .post("/v1/stock/receive")
      .set(...authHeader(companyB.accessToken))
      .send({ warehouseId: warehouseB.id, productVariantId: variantB.id, quantity: 7, createdBy: companyA.userId })
      .expect(201);

    const [stockRow] = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseB.id));
    if (!stockRow) throw new Error("Остаток на складе B не создался");
    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.stockItemId, stockRow.id));
    expect(movement?.createdBy).toBe(companyB.userId);
    expect(movement?.createdBy).not.toBe(companyA.userId);
  });

  it("игнорирует createdBy из тела запроса при создании отгрузки", async () => {
    const shipment = (
      await request(httpServer)
        .post("/v1/shipments")
        .set(...authHeader(companyB.accessToken))
        .send({
          originWarehouseId: warehouseB.id,
          destinationWarehouseId: warehouseB2.id,
          items: [{ productVariantId: variantB.id, quantity: 1 }],
          createdBy: companyA.userId,
        })
        .expect(201)
    ).body as ShipmentResponseDto;
    expect(shipment.createdBy).toBe(companyB.userId);
    expect(shipment.createdBy).not.toBe(companyA.userId);
  });

  // ---- 7: положительный сценарий своей компании продолжает работать ----
  it("положительный сценарий: полный цикл в пределах одной компании работает как раньше", async () => {
    const receive = (
      await request(httpServer)
        .post("/v1/stock/receive")
        .set(...authHeader(companyA.accessToken))
        .send({ warehouseId: warehouseA2.id, productVariantId: variantA.id, quantity: 50 })
        .expect(201)
    ).body as StockItemResponseDto;
    expect(receive.quantityOnHand).toBe("50.000");

    const reserve = (
      await request(httpServer)
        .post("/v1/stock/reserve")
        .set(...authHeader(companyA.accessToken))
        .send({ warehouseId: warehouseA2.id, productVariantId: variantA.id, quantity: 10 })
        .expect(201)
    ).body as StockItemResponseDto;
    expect(reserve.quantityReserved).toBe("10.000");

    await request(httpServer)
      .post("/v1/stock/release")
      .set(...authHeader(companyA.accessToken))
      .send({ warehouseId: warehouseA2.id, productVariantId: variantA.id, quantity: 10 })
      .expect(201);

    const dispatch = (
      await request(httpServer)
        .post("/v1/stock/dispatch")
        .set(...authHeader(companyA.accessToken))
        .send({ warehouseId: warehouseA2.id, productVariantId: variantA.id, quantity: 20 })
        .expect(201)
    ).body as StockItemResponseDto;
    expect(dispatch.quantityOnHand).toBe("30.000");

    const transfer = (
      await request(httpServer)
        .post("/v1/stock/transfer")
        .set(...authHeader(companyA.accessToken))
        .send({ originWarehouseId: warehouseA2.id, destinationWarehouseId: warehouseA.id, productVariantId: variantA.id, quantity: 5 })
        .expect(201)
    ).body as TransferStockResponseDto;
    expect(transfer.origin.quantityOnHand).toBe("25.000");

    const shipment = (
      await request(httpServer)
        .post("/v1/shipments")
        .set(...authHeader(companyA.accessToken))
        .send({ originWarehouseId: warehouseA2.id, destinationWarehouseId: warehouseA.id, items: [{ productVariantId: variantA.id, quantity: 5 }] })
        .expect(201)
    ).body as ShipmentResponseDto;

    const dispatchedShipment = (
      await request(httpServer)
        .post(`/v1/shipments/${shipment.id}/dispatch`)
        .set(...authHeader(companyA.accessToken))
        .expect(201)
    ).body as ShipmentResponseDto;
    expect(dispatchedShipment.status).toBe("in_transit");

    const deliveredShipment = (
      await request(httpServer)
        .post(`/v1/shipments/${shipment.id}/deliver`)
        .set(...authHeader(companyA.accessToken))
        .expect(201)
    ).body as ShipmentResponseDto;
    expect(deliveredShipment.status).toBe("delivered");
  });

  it("положительный сценарий: ограничение роли сохраняется (accountant без warehouse.write — 403, не 404/500)", async () => {
    const accountantCompanyName = `SEC-P1 Accountant ${Date.now()}`;
    createdCompanyNames.push(accountantCompanyName);
    const accountant = await setupAuthenticatedCompany(db, httpServer, accountantCompanyName, "accountant");
    await request(httpServer)
      .post("/v1/stock/receive")
      .set(...authHeader(accountant.accessToken))
      .send({ warehouseId: warehouseA.id, productVariantId: variantA.id, quantity: 1 })
      .expect(403);
  });
});
