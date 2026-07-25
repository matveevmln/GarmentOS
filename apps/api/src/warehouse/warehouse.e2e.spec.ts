import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
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
  InventoryCountResponseDto,
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

describe("Warehouse API (e2e)", () => {
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
        const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
        for (const warehouse of companyWarehouses) {
          const items = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
          for (const item of items) {
            await db.delete(stockMovements).where(eq(stockMovements.stockItemId, item.id));
          }
          await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        }
        const companyShipments = await db.select().from(shipments).where(eq(shipments.companyId, company.id));
        for (const shipment of companyShipments) {
          await db.delete(shipmentItems).where(eq(shipmentItems.shipmentId, shipment.id));
        }
        await db.delete(shipments).where(eq(shipments.companyId, company.id));
        for (const warehouse of companyWarehouses) {
          const counts = await db.select().from(inventoryCounts).where(eq(inventoryCounts.warehouseId, warehouse.id));
          for (const count of counts) {
            await db.delete(inventoryCountItems).where(eq(inventoryCountItems.inventoryCountId, count.id));
          }
          await db.delete(inventoryCounts).where(eq(inventoryCounts.warehouseId, warehouse.id));
        }
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
    }
    await app.close();
  });

  it("проходит полный цикл: приёмка → резерв → списание → перемещение → отгрузка → инвентаризация", async () => {
    const companyName = `E2E Warehouse ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Петроль", code: "HOODIE-PETROL-WH-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-WH-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const originResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: "WIP Цех №1", type: "own" })
      .expect(201);
    const origin = originResponse.body as WarehouseResponseDto;

    const destinationResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: "Склад продаж (Москва)", type: "own" })
      .expect(201);
    const destination = destinationResponse.body as WarehouseResponseDto;

    const afterReceiveResponse = await request(httpServer)
      .post("/v1/stock/receive")
      .set(...authHeader(accessToken))
      .send({ warehouseId: origin.id, productVariantId: variant.id, quantity: 100 })
      .expect(201);
    expect((afterReceiveResponse.body as StockItemResponseDto).quantityOnHand).toBe("100.000");

    const afterReserveResponse = await request(httpServer)
      .post("/v1/stock/reserve")
      .set(...authHeader(accessToken))
      .send({ warehouseId: origin.id, productVariantId: variant.id, quantity: 20 })
      .expect(201);
    expect((afterReserveResponse.body as StockItemResponseDto).quantityReserved).toBe("20.000");

    const rejectedDispatchResponse = await request(httpServer)
      .post("/v1/stock/dispatch")
      .set(...authHeader(accessToken))
      .send({ warehouseId: origin.id, productVariantId: variant.id, quantity: 81 })
      .expect(400);
    expect((rejectedDispatchResponse.body as ErrorResponseBody).code).toBe("STOCK_INSUFFICIENT");

    const afterDispatchResponse = await request(httpServer)
      .post("/v1/stock/dispatch")
      .set(...authHeader(accessToken))
      .send({ warehouseId: origin.id, productVariantId: variant.id, quantity: 80 })
      .expect(201);
    expect((afterDispatchResponse.body as StockItemResponseDto).quantityOnHand).toBe("20.000");

    await request(httpServer)
      .post("/v1/stock/release")
      .set(...authHeader(accessToken))
      .send({ warehouseId: origin.id, productVariantId: variant.id, quantity: 20 })
      .expect(201);

    const directTransferResponse = await request(httpServer)
      .post("/v1/stock/transfer")
      .set(...authHeader(accessToken))
      .send({ originWarehouseId: origin.id, destinationWarehouseId: destination.id, productVariantId: variant.id, quantity: 5 })
      .expect(201);
    const directTransfer = directTransferResponse.body as TransferStockResponseDto;
    expect(directTransfer.origin.quantityOnHand).toBe("15.000");
    expect(directTransfer.destination.quantityOnHand).toBe("5.000");

    const shipmentResponse = await request(httpServer)
      .post("/v1/shipments")
      .set(...authHeader(accessToken))
      .send({
        originWarehouseId: origin.id,
        destinationWarehouseId: destination.id,
        items: [{ productVariantId: variant.id, quantity: 15 }],
      })
      .expect(201);
    const shipment = shipmentResponse.body as ShipmentResponseDto;
    expect(shipment.status).toBe("planned");

    const dispatchedShipmentResponse = await request(httpServer)
      .post(`/v1/shipments/${shipment.id}/dispatch`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((dispatchedShipmentResponse.body as ShipmentResponseDto).status).toBe("in_transit");

    const deliveredShipmentResponse = await request(httpServer)
      .post(`/v1/shipments/${shipment.id}/deliver`)
      .set(...authHeader(accessToken))
      .expect(201);
    const delivered = deliveredShipmentResponse.body as ShipmentResponseDto;
    expect(delivered.status).toBe("delivered");
    expect(delivered.deliveredAt).not.toBeNull();

    const countResponse = await request(httpServer)
      .post("/v1/inventory-counts")
      .set(...authHeader(accessToken))
      .send({ warehouseId: destination.id })
      .expect(201);
    const count = countResponse.body as InventoryCountResponseDto;

    const afterCountResponse = await request(httpServer)
      .post(`/v1/inventory-counts/${count.id}/items`)
      .set(...authHeader(accessToken))
      .send({ productVariantId: variant.id, actualQuantity: 19 })
      .expect(201);
    const afterCount = afterCountResponse.body as InventoryCountResponseDto;
    expect(afterCount.items[0]?.expectedQuantity).toBe("20.000");
    expect(afterCount.items[0]?.actualQuantity).toBe("19.000");
    expect(afterCount.items[0]?.discrepancy).toBe("-1.000");

    const completedResponse = await request(httpServer)
      .post(`/v1/inventory-counts/${count.id}/complete`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((completedResponse.body as InventoryCountResponseDto).status).toBe("completed");
  });

  it("отклоняет несогласованность типа склада и workshopId — 400; accountant без warehouse.write — 403", async () => {
    const companyName = `E2E Warehouse Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: "Склад без workshopId", type: "workshop" })
      .expect(400);

    const { accessToken: accountantToken } = await setupAuthenticatedCompany(
      db,
      httpServer,
      `${companyName} Accountant`,
      "accountant",
    );
    await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accountantToken))
      .send({ name: "Склад бухгалтера", type: "own" })
      .expect(403);
  });
});
