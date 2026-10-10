import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Server } from "node:http";
import {
  createDb,
  stockItems,
  stockMovements,
  batchPayments,
  receiptCorrections,
  transactions,
  auditLog,
  companies,
  productionOrderVariants,
  productionOrders,
  productionOrderQcResults,
  productionOrderDefects,
  specifications,
  specificationItems,
  warehouses,
  productVariants,
  products,
  workshops,
  userRoles,
  users,
  refreshTokens,
  boms,
  bomItems,
  numericValuePresets,
} from "@garmentos/db-schema";
import { eq, inArray } from "drizzle-orm";
import type { BatchSettlementDto, ProductionOrderResponseDto } from "@garmentos/shared-types";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import {
  setupAuthenticatedCompany,
  addUserToCompany,
  authHeader,
} from "../test-support/auth-test-helper";

const db = createDb(process.env.DATABASE_URL!);
describe("Партия: приёмка, исправления и денежные факты", () => {
  let app: INestApplication;
  let server: Server;
  let token: string;
  let companyId: string;
  let otherToken: string;
  let readerToken: string;
  let productId: string;
  let workshopId: string;
  let warehouseId: string;
  let variantIds: string[];
  const companyIds: string[] = [];
  const call = (method: "get" | "post", path: string, body?: object, access = token) =>
    request(server)
      [method](`/v1${path}`)
      .set(...authHeader(access))
      .send(body);
  const payment = (amount = 100, direction = "payment") => ({
    requestId: crypto.randomUUID(),
    amount,
    currency: "RUB",
    direction,
    note: "Проверка",
  });
  const createParty = async (receive = true) => {
    const placed = (
      await call("post", "/production-orders/place", {
        requestId: crypto.randomUUID(),
        mode: "place",
        productId,
        workshopId,
        plannedQuantity: 50,
        agreedUnitPrice: 500,
        variants: variantIds.map((id, i) => ({
          productVariantId: id,
          quantity: i === 0 ? 20 : 30,
        })),
      }).expect(201)
    ).body as ProductionOrderResponseDto;
    if (!receive) return placed;
    await call("post", `/production-orders/${placed.id}/status`, {
      status: "ready_for_pickup",
    }).expect(201);
    return (
      await call("post", `/production-orders/${placed.id}/receive`, {
        warehouseId,
        receivedVariants: placed.variants.map((v) => ({
          productVariantId: v.productVariantId,
          quantity: Number(v.quantity),
        })),
      }).expect(201)
    ).body as ProductionOrderResponseDto;
  };
  const correction = (order: ProductionOrderResponseDto, delta = -2) => ({
    requestId: crypto.randomUUID(),
    reason: "Ошибка при подсчёте",
    expectedVariants: order.variants.map((v) => ({
      productVariantId: v.productVariantId,
      quantity: Number(v.receivedQuantity),
    })),
    variants: order.variants.map((v, i) => ({
      productVariantId: v.productVariantId,
      quantity: Number(v.receivedQuantity) + (i === 0 ? delta : 0),
    })),
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    server = app.getHttpServer() as Server;
    const own = await setupAuthenticatedCompany(
      db,
      server,
      `Batch operations ${crypto.randomUUID()}`,
      "owner",
    );
    token = own.accessToken;
    companyId = own.companyId;
    companyIds.push(companyId);
    const other = await setupAuthenticatedCompany(
      db,
      server,
      `Other operations ${crypto.randomUUID()}`,
      "owner",
    );
    otherToken = other.accessToken;
    companyIds.push(other.companyId);
    readerToken = (await addUserToCompany(db, server, companyId, "viewer")).accessToken;
    productId = (
      (await call("post", "/products", { name: "Хуплушка", code: crypto.randomUUID() }).expect(201))
        .body as { id: string }
    ).id;
    variantIds = [];
    for (const size of ["48-50", "52-54"])
      variantIds.push(
        (
          (
            await call("post", "/product-variants", {
              productId,
              size,
              color: "Петрол",
              skuCode: crypto.randomUUID(),
            }).expect(201)
          ).body as { id: string }
        ).id,
      );
    workshopId = (
      (await call("post", "/workshops", { name: "Ак Сарай" }).expect(201)).body as { id: string }
    ).id;
    warehouseId = (
      (await call("post", "/warehouses", { name: "Мои изделия", type: "own" }).expect(201))
        .body as { id: string }
    ).id;
  });
  afterAll(async () => {
    for (const id of companyIds) {
      await db.delete(batchPayments).where(eq(batchPayments.companyId, id));
      await db.delete(receiptCorrections).where(eq(receiptCorrections.companyId, id));
      await db.delete(transactions).where(eq(transactions.companyId, id));
      const specs = await db.select().from(specifications).where(eq(specifications.companyId, id));
      for (const s of specs)
        await db.delete(specificationItems).where(eq(specificationItems.specificationId, s.id));
      await db.delete(specifications).where(eq(specifications.companyId, id));
      const orders = await db
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.companyId, id));
      for (const o of orders)
        await db
          .delete(productionOrderVariants)
          .where(eq(productionOrderVariants.productionOrderId, o.id));
      await db.delete(productionOrderDefects).where(eq(productionOrderDefects.companyId, id));
      await db.delete(productionOrderQcResults).where(eq(productionOrderQcResults.companyId, id));
      await db.delete(productionOrders).where(eq(productionOrders.companyId, id));
      await db.delete(numericValuePresets).where(eq(numericValuePresets.companyId, id));
      const companyBoms = await db.select().from(boms).where(eq(boms.companyId, id));
      for (const bom of companyBoms) await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
      await db.delete(boms).where(eq(boms.companyId, id));
      if (id === companyId && warehouseId) {
        const items = await db
          .select()
          .from(stockItems)
          .where(eq(stockItems.warehouseId, warehouseId));
        if (items.length)
          await db.delete(stockMovements).where(
            inArray(
              stockMovements.stockItemId,
              items.map((i) => i.id),
            ),
          );
        await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouseId));
      }
      await db.delete(warehouses).where(eq(warehouses.companyId, id));
      await db.delete(workshops).where(eq(workshops.companyId, id));
      if (id === companyId && productId)
        await db.delete(productVariants).where(eq(productVariants.productId, productId));
      await db.delete(products).where(eq(products.companyId, id));
      await db.delete(auditLog).where(eq(auditLog.companyId, id));
      const accounts = await db.select().from(users).where(eq(users.companyId, id));
      for (const u of accounts) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, u.id));
        await db.delete(userRoles).where(eq(userRoles.userId, u.id));
      }
      await db.delete(users).where(eq(users.companyId, id));
      await db.delete(companies).where(eq(companies.id, id));
    }
    await app.close();
  });

  it("приёмка 50 → 48 меняет остаток на -2 и сохраняет исходные движения", async () => {
    const o = await createParty();
    const before = await db
      .select()
      .from(stockItems)
      .where(eq(stockItems.warehouseId, warehouseId));
    const input = correction(o);
    const fixed = (
      await call("post", `/production-orders/${o.id}/receipt-correction`, input).expect(201)
    ).body as ProductionOrderResponseDto;
    expect(fixed.variants.reduce((n, v) => n + Number(v.receivedQuantity), 0)).toBe(48);
    const after = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseId));
    expect(
      after.reduce((n, i) => n + Number(i.quantityOnHand), 0) -
        before.reduce((n, i) => n + Number(i.quantityOnHand), 0),
    ).toBe(-2);
    const movements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, input.requestId));
    expect(movements).toHaveLength(1);
    expect(Number(movements[0].quantity)).toBe(-2);
    expect(
      await db.select().from(stockMovements).where(eq(stockMovements.referenceId, o.id)),
    ).toHaveLength(2);
    await call("post", `/production-orders/${o.id}/receipt-correction`, input).expect(201);
    expect(
      await db.select().from(stockMovements).where(eq(stockMovements.referenceId, input.requestId)),
    ).toHaveLength(1);
    const history = (
      (await call("get", `/production-orders/${o.id}/passport`).expect(200)).body as {
        timeline: Array<{ label: string }>;
      }
    ).timeline;
    expect(history.some((h) => h.label.includes("50 → 48"))).toBe(true);
    expect(
      (
        (await call("get", `/production-orders/${o.id}/settlement`).expect(200))
          .body as BatchSettlementDto
      ).agreedAmount,
    ).toBe(25000);
  });
  it("отклоняет устаревшую приёмку, дубли строк и изменённый запрос с прежним UUID", async () => {
    const o = await createParty();
    const input = correction(o);
    await call("post", `/production-orders/${o.id}/receipt-correction`, input).expect(201);
    await call("post", `/production-orders/${o.id}/receipt-correction`, {
      ...input,
      reason: "Другой запрос",
    }).expect(409);
    const stale = await call("post", `/production-orders/${o.id}/receipt-correction`, {
      ...input,
      requestId: crypto.randomUUID(),
    });
    expect(stale.status).toBe(400);
    const duplicate = await call("post", `/production-orders/${o.id}/receipt-correction`, {
      ...input,
      requestId: crypto.randomUUID(),
      variants: [input.variants[0], input.variants[0]],
    });
    expect(duplicate.status).toBe(400);
  });
  it("откат всей операции при недостатке зарезервированного остатка", async () => {
    const o = await createParty();
    const rows = [...o.variants].sort((a, b) =>
      a.productVariantId.localeCompare(b.productVariantId),
    );
    const last = rows[1];
    const items = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseId));
    const locked = items.find((i) => i.productVariantId === last.productVariantId)!;
    await db
      .update(stockItems)
      .set({ quantityReserved: locked.quantityOnHand })
      .where(eq(stockItems.id, locked.id));
    const input = correction(o);
    input.variants = rows.map((v, i) => ({
      productVariantId: v.productVariantId,
      quantity: Number(v.receivedQuantity) + (i === 0 ? 1 : -1),
    }));
    await call("post", `/production-orders/${o.id}/receipt-correction`, input).expect(409);
    expect(
      await db.select().from(receiptCorrections).where(eq(receiptCorrections.id, input.requestId)),
    ).toHaveLength(0);
    const after = await db.select().from(stockItems).where(eq(stockItems.warehouseId, warehouseId));
    expect(after.map((r) => r.quantityOnHand).sort()).toEqual(
      items.map((r) => r.quantityOnHand).sort(),
    );
    await db.update(stockItems).set({ quantityReserved: "0" }).where(eq(stockItems.id, locked.id));
  });
  it("закрытая партия после исправления возвращается на проверку", async () => {
    const o = await createParty();
    await call("post", `/production-orders/${o.id}/complete`).expect(201);
    const fixed = await call(
      "post",
      `/production-orders/${o.id}/receipt-correction`,
      correction(o),
    ).expect(201);
    expect((fixed.body as ProductionOrderResponseDto).status).toBe("received");
  });
  it("после записанного ОТК отдельное исправление приёмки запрещено", async () => {
    const o = await createParty();
    await call("post", `/production-orders/${o.id}/qc`, {
      receivedQuantity: 50,
      goodQuantity: 50,
      defectQuantity: 0,
    }).expect(201);
    expect(
      (
        (await call("get", `/production-orders/${o.id}/receipt-correction`).expect(200)).body as {
          allowed: boolean;
        }
      ).allowed,
    ).toBe(false);
    await call("post", `/production-orders/${o.id}/receipt-correction`, correction(o)).expect(409);
  });
  it("черновик показывает план, а не долг цеху, и не принимает оплату", async () => {
    const o = (
      await call("post", "/production-orders/place", {
        requestId: crypto.randomUUID(),
        mode: "draft",
        productId,
        workshopId,
        plannedQuantity: 50,
        agreedUnitPrice: 500,
        variants: variantIds.map((id, i) => ({
          productVariantId: id,
          quantity: i === 0 ? 20 : 30,
        })),
      }).expect(201)
    ).body as ProductionOrderResponseDto;
    const s = (await call("get", `/production-orders/${o.id}/settlement`).expect(200))
      .body as BatchSettlementDto;
    expect(s.agreedAmount).toBe(25000);
    expect(s.outstanding).toBeNull();
    expect(s.canWrite).toBe(false);
    await call("post", `/production-orders/${o.id}/payments`, payment()).expect(400);
  });
  it("аванс и доплата учитываются с копейками, отдельно от этапа партии", async () => {
    const o = await createParty(false);
    const first = payment(12000.5);
    const second = payment(2499.5);
    await call("post", `/production-orders/${o.id}/payments`, first).expect(201);
    const result = (await call("post", `/production-orders/${o.id}/payments`, second).expect(201))
      .body as BatchSettlementDto;
    expect(result.netPaid).toBe(14500);
    expect(result.outstanding).toBe(10500);
    expect(result.payments).toHaveLength(2);
    expect(
      (
        (await call("get", `/production-orders/${o.id}`).expect(200))
          .body as ProductionOrderResponseDto
      ).status,
    ).toBe("placed");
  });
  it("одновременный повтор платежа и повтор исправления не создают дубли", async () => {
    const o = await createParty(false);
    const input = payment(100.01);
    const responses = await Promise.all([
      call("post", `/production-orders/${o.id}/payments`, input),
      call("post", `/production-orders/${o.id}/payments`, input),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    const original = (
      await db.select().from(batchPayments).where(eq(batchPayments.id, input.requestId))
    )[0];
    const reverse = { requestId: crypto.randomUUID(), reason: "Ошибочная сумма" };
    await call(
      "post",
      `/production-orders/${o.id}/payments/${original.id}/reverse`,
      reverse,
    ).expect(201);
    await call(
      "post",
      `/production-orders/${o.id}/payments/${original.id}/reverse`,
      reverse,
    ).expect(201);
    const result = (await call("get", `/production-orders/${o.id}/settlement`).expect(200))
      .body as BatchSettlementDto;
    expect(result.netPaid).toBe(0);
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0].reversed).toBe(true);
    expect(
      await db.select().from(transactions).where(eq(transactions.referenceId, o.id)),
    ).toHaveLength(2);
    await call("post", `/production-orders/${o.id}/payments/${original.id}/reverse`, {
      ...reverse,
      requestId: crypto.randomUUID(),
    }).expect(409);
  });
  it("не разрешает неверную валюту, дробные копейки, возврат сверх оплаты", async () => {
    const o = await createParty(false);
    await call("post", `/production-orders/${o.id}/payments`, {
      ...payment(),
      currency: "KGS",
    }).expect(400);
    await call("post", `/production-orders/${o.id}/payments`, payment(100.009)).expect(400);
    await call("post", `/production-orders/${o.id}/payments`, payment(1, "refund")).expect(400);
    const input = payment();
    await call("post", `/production-orders/${o.id}/payments`, input).expect(201);
    await call("post", `/production-orders/${o.id}/payments`, { ...input, amount: 200 }).expect(
      409,
    );
  });
  it("отмена партии сохраняет аванс, позволяет возврат и не предполагает новых обязательств", async () => {
    const o = await createParty(false);
    const original = payment(100);
    await call("post", `/production-orders/${o.id}/payments`, original).expect(201);
    await call("post", `/production-orders/${o.id}/cancel`, { reason: "Передумал шить" }).expect(
      201,
    );
    const cancelled = (await call("get", `/production-orders/${o.id}/settlement`).expect(200))
      .body as BatchSettlementDto;
    expect(cancelled.netPaid).toBe(100);
    expect(cancelled.outstanding).toBeNull();
    expect(cancelled.canWrite).toBe(true);
    await call("post", `/production-orders/${o.id}/payments`, payment(100)).expect(400);
    await call("post", `/production-orders/${o.id}/payments`, payment(100, "refund")).expect(201);
    expect(
      ((await call("get", `/production-orders/${o.id}/settlement`)).body as BatchSettlementDto)
        .netPaid,
    ).toBe(0);
  });
  it("историческое движение без валюты не превращается в подтверждённую оплату", async () => {
    const o = await createParty(false);
    await db.insert(transactions).values({
      companyId,
      type: "expense",
      amount: "500",
      referenceType: "production_order",
      referenceId: o.id,
    });
    const s = (await call("get", `/production-orders/${o.id}/settlement`).expect(200))
      .body as BatchSettlementDto;
    expect(s.unclassifiedTransactions).toBe(1);
    expect(s.netPaid).toBe(0);
    expect(s.outstanding).toBeNull();
  });
  it("изолирует компанию и ограничивает изменения правами", async () => {
    const o = await createParty();
    await call("get", `/production-orders/${o.id}/settlement`, undefined, otherToken).expect(404);
    await call("post", `/production-orders/${o.id}/payments`, payment(), otherToken).expect(404);
    await call("post", `/production-orders/${o.id}/payments`, payment(), readerToken).expect(403);
    await call(
      "post",
      `/production-orders/${o.id}/receipt-correction`,
      correction(o),
      readerToken,
    ).expect(403);
  });
});
