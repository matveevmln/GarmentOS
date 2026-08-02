import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  companies,
  costEntries,
  createDb,
  invoices,
  productVariants,
  products,
  refreshTokens,
  transactions,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type {
  CostEntryResponseDto,
  InvoiceResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  TransactionResponseDto,
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

interface ErrorResponseBody {
  statusCode: number;
  code?: string;
  message: string;
}

describe("Finance API (e2e)", () => {
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
        await db.delete(auditLog).where(eq(auditLog.companyId, company.id));
        await db.delete(invoices).where(eq(invoices.companyId, company.id));
        await db.delete(transactions).where(eq(transactions.companyId, company.id));
        await db.delete(costEntries).where(eq(costEntries.companyId, company.id));
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

  it("записывает себестоимость и движение денег, проводит счёт draft → issued → paid", async () => {
    const companyName = `E2E Finance ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Худи Петроль", code: "HOODIE-PETROL-FIN-E2E" })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "Петроль", skuCode: "HOODIE-PETROL-FIN-E2E-M" })
      .expect(201);
    const variant = variantResponse.body as ProductVariantResponseDto;

    const costEntryResponse = await request(httpServer)
      .post("/v1/cost-entries")
      .set(...authHeader(accessToken))
      .send({
        productVariantId: variant.id,
        materialCost: 500,
        manufacturingCost: 450,
        logisticsCost: 50,
      })
      .expect(201);
    const costEntry = costEntryResponse.body as CostEntryResponseDto;
    expect(costEntry.materialCost).toBe("500.00");
    expect(costEntry.overheadCost).toBe("0.00");

    const transactionResponse = await request(httpServer)
      .post("/v1/transactions")
      .set(...authHeader(accessToken))
      .send({ type: "expense", amount: 1000 })
      .expect(201);
    expect((transactionResponse.body as TransactionResponseDto).type).toBe("expense");

    const invoiceResponse = await request(httpServer)
      .post("/v1/invoices")
      .set(...authHeader(accessToken))
      .send({ amount: 7000 })
      .expect(201);
    const invoice = invoiceResponse.body as InvoiceResponseDto;
    expect(invoice.status).toBe("draft");

    const issuedResponse = await request(httpServer)
      .post(`/v1/invoices/${invoice.id}/issue`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((issuedResponse.body as InvoiceResponseDto).status).toBe("issued");

    // Итерация 6: "финансовые проводки" — явно названная в docs/ARCHITECTURE.md,
    // раздел 7 критичная операция — переход статуса счёта пишется с before/after.
    const [issueAuditRow] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, invoice.id), eq(auditLog.action, "finance.invoice_issue")));
    expect(issueAuditRow?.source).toBe("http_api");
    expect(issueAuditRow?.beforeJson).toEqual({ status: "draft" });
    expect(issueAuditRow?.afterJson).toEqual({ status: "issued" });

    const paidResponse = await request(httpServer)
      .post(`/v1/invoices/${invoice.id}/pay`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((paidResponse.body as InvoiceResponseDto).status).toBe("paid");

    // Оплаченный счёт — терминальное состояние, повторная отмена запрещена.
    const invalidCancelResponse = await request(httpServer)
      .post(`/v1/invoices/${invoice.id}/cancel`)
      .set(...authHeader(accessToken))
      .expect(409);
    expect((invalidCancelResponse.body as ErrorResponseBody).code).toBe("INVOICE_INVALID_STATUS_TRANSITION");
  });

  it("POST /v1/transactions с отрицательной суммой — 400; procurement_manager без finance.write — 403", async () => {
    const companyName = `E2E Finance Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    await request(httpServer)
      .post("/v1/transactions")
      .set(...authHeader(accessToken))
      .send({ type: "income", amount: -1 })
      .expect(400);

    const { accessToken: procurementManagerToken } = await setupAuthenticatedCompany(
      db,
      httpServer,
      `${companyName} Procurement`,
      "procurement_manager",
    );
    await request(httpServer)
      .post("/v1/transactions")
      .set(...authHeader(procurementManagerToken))
      .send({ type: "income", amount: 100 })
      .expect(403);
  });
});
