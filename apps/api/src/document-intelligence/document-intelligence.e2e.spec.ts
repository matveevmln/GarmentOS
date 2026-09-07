import { config } from "dotenv";

config({ path: "../../.env" });

// ANTHROPIC_API_KEY должен быть выставлен ДО компиляции AppModule — фабрика
// AI_CLASSIFIER (ai-production-assistant.module.ts) читает process.env
// синхронно в момент создания провайдера. apps/api/vitest.config.ts не
// переопределяет pool/isolate, значит действует изоляция по процессу на
// файл (Vitest 4 по умолчанию) — установка здесь не протекает в другие
// спек-файлы (тот же приём, что и в остальных e2e-тестах на login-rate-limit).
process.env.ANTHROPIC_API_KEY = "test-anthropic-key";

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  auditLog,
  companies,
  createDb,
  documentDerivatives,
  documentLinks,
  documents,
  materials,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  suppliers,
  userRoles,
  users,
} from "@garmentos/db-schema";
import type {
  ConfirmDocumentResponseDto,
  ExtractDocumentResponseDto,
  MaterialResponseDto,
} from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

// Реальный пример владельца проекта (P6): инвойс RB-260628 (3 позиции ткани),
// сумма по строкам сходится с заявленным итогом $27,856.98.
const INVOICE_TEXT =
  "Invoice RB-260628 от 28.06.2026, поставщик ABC Textile. " +
  "Стеганое полотно 4843.70 kg x $4.10 = $19,859.17. " +
  "Подклад 4624.40 m x $0.75 = $3,468.30. " +
  "Плащевка 4767.90 m x $0.95 = $4,529.51. " +
  "Итого: $27,856.98.";

function invoiceExtractionPayload() {
  return {
    documentType: "invoice",
    supplierName: "ABC Textile",
    documentNumber: "RB-260628",
    documentDate: "2026-06-28",
    currency: "USD",
    totalAmount: 27856.98,
    totalPackages: null,
    totalNetWeight: null,
    totalGrossWeight: null,
    totalCbm: null,
    lines: [
      {
        description: "стеганое полотно",
        materialCode: null,
        color: null,
        quantity: 4843.7,
        unit: "kg",
        unitPrice: 4.1,
        lineTotal: 19859.17,
        packageCount: null,
        packageUnit: null,
        netWeight: null,
        grossWeight: null,
        cbm: null,
      },
      {
        description: "подклад",
        materialCode: null,
        color: null,
        quantity: 4624.4,
        unit: "m",
        unitPrice: 0.75,
        lineTotal: 3468.3,
        packageCount: null,
        packageUnit: null,
        netWeight: null,
        grossWeight: null,
        cbm: null,
      },
      {
        description: "плащевка",
        materialCode: null,
        color: null,
        quantity: 4767.9,
        unit: "m",
        unitPrice: 0.95,
        lineTotal: 4529.51,
        packageCount: null,
        packageUnit: null,
        netWeight: null,
        grossWeight: null,
        cbm: null,
      },
    ],
  };
}

function stubAnthropicFetch(payload: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
    }),
  );
}

describe("Document Intelligence API (e2e)", () => {
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    for (const name of createdCompanyNames) {
      const [company] = await db.select().from(companies).where(eq(companies.name, name));
      if (company) {
        const companyOrders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        for (const order of companyOrders) {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, order.id));
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));

        const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
        for (const document of companyDocuments) {
          await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, document.id));
        }
        await db.delete(documentLinks).where(eq(documentLinks.companyId, company.id));
        await db.delete(documents).where(eq(documents.companyId, company.id));

        await db.delete(materials).where(eq(materials.companyId, company.id));
        await db.delete(suppliers).where(eq(suppliers.companyId, company.id));
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

  it("извлечение инвойса: предлагает совпадение по существующему материалу, ничего не создаёт в materials/suppliers/purchase_orders", async () => {
    const companyName = `E2E DocIntel Extract ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "procurement_manager");

    // Плащевка уже есть карточкой — AI должен её предложить, а не создать
    // вторую (сценарий 9/10: только предложение, без автоматического слияния).
    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Плащевка", type: "fabric", unit: "m" })
      .expect(201);
    const existingMaterial = materialResponse.body as MaterialResponseDto;

    stubAnthropicFetch(invoiceExtractionPayload());

    const extractResponse = await request(httpServer)
      .post("/v1/document-intelligence/extract")
      .set(...authHeader(accessToken))
      .send({ documentType: "invoice", text: INVOICE_TEXT })
      .expect(201);
    const extraction = extractResponse.body as ExtractDocumentResponseDto;

    expect(extraction.extracted.totalAmount).toBe(27856.98);
    expect(extraction.extracted.lines).toHaveLength(3);
    expect(extraction.materialMatches).toHaveLength(3);
    // Плащевка — третья строка примера — должна получить точное совпадение.
    expect(extraction.materialMatches[2]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: existingMaterial.id, kind: "exact" })]),
    );
    // Остальные две строки — новые материалы, совпадений быть не должно.
    expect(extraction.materialMatches[0]).toEqual([]);
    expect(extraction.materialMatches[1]).toEqual([]);
    expect(extraction.reconciliation[0]).toMatchObject({ label: "Сумма по строкам", status: "match" });

    // Сценарий 15/10: extract() — это только предложение. Ни материалы, ни
    // поставщики, ни закупки этим вызовом не создаются и не изменяются.
    const [company] = await db.select().from(companies).where(eq(companies.name, companyName));
    const materialsAfter = await db.select().from(materials).where(eq(materials.companyId, company.id));
    const suppliersAfter = await db.select().from(suppliers).where(eq(suppliers.companyId, company.id));
    const purchaseOrdersAfter = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
    expect(materialsAfter).toHaveLength(1); // только та, что создали вручную выше
    expect(suppliersAfter).toHaveLength(0);
    expect(purchaseOrdersAfter).toHaveLength(0);

    // Извлечение сохранено как document_derivatives(type=structured_data),
    // не в новой отдельной таблице.
    const derivatives = await db
      .select()
      .from(documentDerivatives)
      .where(eq(documentDerivatives.documentId, extraction.documentId));
    expect(derivatives).toHaveLength(1);
    expect(derivatives[0]?.type).toBe("structured_data");
  });

  it("повторное извлечение по тому же документу создаёт новую запись, не перезаписывая предыдущую", async () => {
    const companyName = `E2E DocIntel Reextract ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "procurement_manager");

    stubAnthropicFetch(invoiceExtractionPayload());
    const firstResponse = await request(httpServer)
      .post("/v1/document-intelligence/extract")
      .set(...authHeader(accessToken))
      .send({ documentType: "invoice", text: INVOICE_TEXT })
      .expect(201);
    const first = firstResponse.body as ExtractDocumentResponseDto;

    stubAnthropicFetch(invoiceExtractionPayload());
    const secondResponse = await request(httpServer)
      .post("/v1/document-intelligence/extract")
      .set(...authHeader(accessToken))
      .send({ documentType: "invoice", text: INVOICE_TEXT, documentId: first.documentId })
      .expect(201);
    const second = secondResponse.body as ExtractDocumentResponseDto;

    expect(second.documentId).toBe(first.documentId);
    expect(second.derivativeId).not.toBe(first.derivativeId);

    const derivatives = await db
      .select()
      .from(documentDerivatives)
      .where(eq(documentDerivatives.documentId, first.documentId));
    expect(derivatives).toHaveLength(2);
  });

  it("подтверждение создаёт материалы/поставщика/закупку, связи документов и запись аудита", async () => {
    const companyName = `E2E DocIntel Confirm ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken, userId } = await setupAuthenticatedCompany(db, httpServer, companyName, "procurement_manager");

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Плащевка", type: "fabric", unit: "m" })
      .expect(201);
    const existingMaterial = materialResponse.body as MaterialResponseDto;

    stubAnthropicFetch(invoiceExtractionPayload());
    const extractResponse = await request(httpServer)
      .post("/v1/document-intelligence/extract")
      .set(...authHeader(accessToken))
      .send({ documentType: "invoice", text: INVOICE_TEXT })
      .expect(201);
    const extraction = extractResponse.body as ExtractDocumentResponseDto;

    const confirmResponse = await request(httpServer)
      .post("/v1/document-intelligence/confirm")
      .set(...authHeader(accessToken))
      .send({
        documentId: extraction.documentId,
        documentType: "invoice",
        supplier: { name: "ABC Textile", type: "fabric" },
        supplierMatchSource: "manual",
        currency: "USD",
        lines: [
          {
            material: { name: "Стеганое полотно", type: "fabric", unit: "kg" },
            quantity: 4843.7,
            unitPrice: 4.1,
            matchSource: "manual",
          },
          {
            material: { name: "Подклад", type: "fabric", unit: "m" },
            quantity: 4624.4,
            unitPrice: 0.75,
            matchSource: "manual",
          },
          {
            material: { id: existingMaterial.id },
            quantity: 4767.9,
            unitPrice: 0.95,
            matchSource: "ai",
          },
        ],
      })
      .expect(201);
    const confirmed = confirmResponse.body as ConfirmDocumentResponseDto;

    expect(confirmed.supplierId).not.toBeNull();
    expect(confirmed.materialIds).toHaveLength(3);
    expect(confirmed.materialIds[2]).toBe(existingMaterial.id);

    // Каноническая закупка реально создана (сценарий 11) — переиспользован
    // существующий createPurchaseOrderDraft, никакой параллельной таблицы.
    const [purchaseOrder] = await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, confirmed.purchaseOrderId));
    expect(purchaseOrder).toBeDefined();
    expect(purchaseOrder?.supplierId).toBe(confirmed.supplierId);
    const items = await db.select().from(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, confirmed.purchaseOrderId));
    expect(items).toHaveLength(3);

    const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, confirmed.supplierId!));
    expect(supplier?.name).toBe("ABC Textile");

    // Существующий материал не продублирован — тот же id, что и раньше.
    const [reusedMaterial] = await db.select().from(materials).where(eq(materials.id, existingMaterial.id));
    expect(reusedMaterial?.name).toBe("Плащевка");

    // document_links (сценарий 12): временная связь "company" от загрузки
    // вставленного текста (extract(), см. document-intelligence.service.ts)
    // + 3 материала + 1 закупка + 1 новый поставщик, добавленные confirm().
    const links = await db.select().from(documentLinks).where(eq(documentLinks.documentId, extraction.documentId));
    expect(links).toHaveLength(6);
    expect(links.some((link) => link.entityType === "company")).toBe(true);
    const materialLinks = links.filter((link) => link.entityType === "material");
    expect(materialLinks.map((link) => link.entityId).sort()).toEqual(confirmed.materialIds.slice().sort());
    const aiMaterialLink = materialLinks.find((link) => link.entityId === existingMaterial.id);
    expect(aiMaterialLink?.source).toBe("ai");
    expect(aiMaterialLink?.confidence).toBe("0.80");
    const manualMaterialLink = materialLinks.find((link) => link.entityId !== existingMaterial.id);
    expect(manualMaterialLink?.source).toBe("manual");
    expect(manualMaterialLink?.confidence).toBeNull();
    const purchaseOrderLink = links.find((link) => link.entityType === "purchase_order");
    expect(purchaseOrderLink?.entityId).toBe(confirmed.purchaseOrderId);
    const supplierLink = links.find((link) => link.entityType === "supplier");
    expect(supplierLink?.entityId).toBe(confirmed.supplierId);
    expect(links.every((link) => link.linkedBy === userId)).toBe(true);

    // Запись аудита (сценарий 13) — переиспользован существующий AuditService,
    // не заведена новая таблица аудита.
    const auditEntries = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, confirmed.purchaseOrderId));
    const confirmationEntry = auditEntries.find((entry) => entry.action === "document_intelligence.confirmed");
    expect(confirmationEntry).toBeDefined();
    expect(confirmationEntry?.entityType).toBe("purchase_order");
    expect(confirmationEntry?.userId).toBe(userId);
  });

  it("подтверждение без поставщика при создании новой закупки — 404 DOCUMENT_INTELLIGENCE_SUPPLIER_REQUIRED", async () => {
    const companyName = `E2E DocIntel ConfirmNoSupplier ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "procurement_manager");

    stubAnthropicFetch(invoiceExtractionPayload());
    const extractResponse = await request(httpServer)
      .post("/v1/document-intelligence/extract")
      .set(...authHeader(accessToken))
      .send({ documentType: "invoice", text: INVOICE_TEXT })
      .expect(201);
    const extraction = extractResponse.body as ExtractDocumentResponseDto;

    const response = await request(httpServer)
      .post("/v1/document-intelligence/confirm")
      .set(...authHeader(accessToken))
      .send({
        documentId: extraction.documentId,
        documentType: "invoice",
        lines: [
          { material: { name: "Стеганое полотно", type: "fabric", unit: "kg" }, quantity: 1, matchSource: "manual" },
        ],
      })
      .expect(404);

    expect((response.body as { code?: string }).code).toBe("DOCUMENT_INTELLIGENCE_SUPPLIER_REQUIRED");
  });
});
