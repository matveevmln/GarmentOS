import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, orderItems, orders, productVariants, products, salesChannels } from "@garmentos/db-schema";
import type {
  OrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  SalesChannelResponseDto,
} from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";

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

describe("Sales API (e2e)", () => {
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
        const companyOrders = await db.select().from(orders).where(eq(orders.companyId, company.id));
        for (const order of companyOrders) {
          await db.delete(orderItems).where(eq(orderItems.orderId, order.id));
        }
        await db.delete(orders).where(eq(orders.companyId, company.id));
        await db.delete(salesChannels).where(eq(salesChannels.companyId, company.id));
        const companyProducts = await db.select().from(products).where(eq(products.companyId, company.id));
        for (const product of companyProducts) {
          await db.delete(productVariants).where(eq(productVariants.productId, product.id));
        }
        await db.delete(products).where(eq(products.companyId, company.id));
        await db.delete(companies).where(eq(companies.id, company.id));
      }
    }
    await app.close();
  });

  it("создаёт канал продаж и заказ, проводит его new → confirmed → shipped → delivered", async () => {
    const companyName = `E2E Sales ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .send({ companyId: company.id, name: "Худи Петроль", code: "HOODIE-PETROL-SALES-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-SALES-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const channelResponse = await request(httpServer)
      .post("/v1/sales-channels")
      .send({ companyId: company.id, type: "marketplace", name: "Wildberries" })
      .expect(201);
    const channel = channelResponse.body as SalesChannelResponseDto;

    const orderResponse = await request(httpServer)
      .post("/v1/orders")
      .send({
        companyId: company.id,
        salesChannelId: channel.id,
        items: [{ productVariantId: variant.id, quantity: 2, unitPrice: 3500 }],
      })
      .expect(201);
    const order = orderResponse.body as OrderResponseDto;
    expect(order.status).toBe("new");
    expect(order.totalAmount).toBe("7000.00");

    const confirmedResponse = await request(httpServer)
      .post(`/v1/orders/${order.id}/confirm`)
      .send({ companyId: company.id })
      .expect(201);
    expect((confirmedResponse.body as OrderResponseDto).status).toBe("confirmed");

    // Недопустимый переход: подтверждённый заказ нельзя доставить, минуя отгрузку.
    const invalidTransitionResponse = await request(httpServer)
      .post(`/v1/orders/${order.id}/deliver`)
      .send({ companyId: company.id })
      .expect(409);
    expect((invalidTransitionResponse.body as ErrorResponseBody).code).toBe("ORDER_INVALID_STATUS_TRANSITION");

    const shippedResponse = await request(httpServer)
      .post(`/v1/orders/${order.id}/ship`)
      .send({ companyId: company.id })
      .expect(201);
    expect((shippedResponse.body as OrderResponseDto).status).toBe("shipped");

    const deliveredResponse = await request(httpServer)
      .post(`/v1/orders/${order.id}/deliver`)
      .send({ companyId: company.id })
      .expect(201);
    expect((deliveredResponse.body as OrderResponseDto).status).toBe("delivered");
  });

  it("POST /v1/orders без позиций — 400", async () => {
    const companyName = `E2E Sales Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");

    const channelResponse = await request(httpServer)
      .post("/v1/sales-channels")
      .send({ companyId: company.id, type: "retail", name: "Розничная точка" })
      .expect(201);
    const channel = channelResponse.body as SalesChannelResponseDto;

    await request(httpServer)
      .post("/v1/orders")
      .send({ companyId: company.id, salesChannelId: channel.id, items: [] })
      .expect(400);
  });
});
