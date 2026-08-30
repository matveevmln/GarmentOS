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
  documentDerivatives,
  documentLinks,
  documents,
  materials,
  productionOrders,
  productionOrderVariants,
  productVariants,
  products,
  refreshTokens,
  telegramInviteCodes,
  userRoles,
  users,
  workshops,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  DocumentResponseDto,
  MaterialResponseDto,
  ParsedProductionRequestResponseDto,
  ProductResponseDto,
  ProductionOrderResponseDto,
  TelegramInviteResponseDto,
  WorkshopResponseDto,
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

const SIZES = ["48-50", "52-54", "56-58", "60-62", "64-66"];
const COLORS = ["Петроль", "Бордо"];

describe("Вертикальный сценарий Итерации 7 (e2e): текст → заказ пошива → спецификация → Telegram → статус", () => {
  let app: INestApplication;
  let httpServer: Server;
  const createdCompanyNames: string[] = [];

  const originalS3Endpoint = process.env.S3_ENDPOINT;

  beforeAll(async () => {
    // В этом окружении нет запущенного MinIO (docker недоступен в песочнице) —
    // отключаем S3_ENDPOINT, чтобы DocumentModule выбрал LocalFileStorageAdapter
    // (тот же принцип, что LoggingTelegramClient без TELEGRAM_BOT_TOKEN).
    // В реальном окружении с docker-compose (infra/docker-compose.yml) этот
    // тест так же проходит через настоящий S3StorageAdapter.
    delete process.env.S3_ENDPOINT;
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
          await db.delete(productionOrderVariants).where(eq(productionOrderVariants.productionOrderId, order.id));
        }
        await db.delete(productionOrders).where(eq(productionOrders.companyId, company.id));
        const companyDocuments = await db.select().from(documents).where(eq(documents.companyId, company.id));
        for (const doc of companyDocuments) {
          await db.delete(documentDerivatives).where(eq(documentDerivatives.documentId, doc.id));
        }
        await db.delete(documentLinks).where(eq(documentLinks.companyId, company.id));
        await db.delete(documents).where(eq(documents.companyId, company.id));
        await db.delete(telegramInviteCodes).where(eq(telegramInviteCodes.companyId, company.id));
        await db.delete(workshops).where(eq(workshops.companyId, company.id));
        const companyBoms = await db.select().from(boms).where(eq(boms.companyId, company.id));
        for (const bom of companyBoms) {
          await db.delete(bomItems).where(eq(bomItems.bomId, bom.id));
        }
        await db.delete(boms).where(eq(boms.companyId, company.id));
        await db.delete(materials).where(eq(materials.companyId, company.id));
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
    if (originalS3Endpoint) process.env.S3_ENDPOINT = originalS3Endpoint;
    await app.close();
  });

  it("проходит весь путь: текст → черновик заказа → подтверждение → спецификация → привязка цеха в Telegram → статус от цеха", async () => {
    const companyName = `E2E Vertical Scenario ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    // Каталог: модель "Двойка" + 10 SKU (2 цвета × 5 размеров) — уже
    // существуют до текстового запроса (AI не придумывает модель/SKU).
    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Двойка", code: `DVOIKA-${Date.now()}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    for (const color of COLORS) {
      for (const size of SIZES) {
        await request(httpServer)
          .post("/v1/product-variants")
          .set(...authHeader(accessToken))
          .send({ productId: product.id, size, color, skuCode: `DVOIKA-${size}-${color}-${product.id.slice(0, 4)}` })
          .expect(201);
      }
    }

    // BOM: утверждённая спецификация обязательна для размещения заказа.
    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Трикотаж", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const bomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 0.8 }] })
      .expect(201);
    const bomDraft = bomResponse.body as BomResponseDto;
    await request(httpServer)
      .post(`/v1/boms/${bomDraft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    // Цех — с рамочным договором, к которому нумеруются спецификации.
    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({
        name: "Ак-Сарай Текстиль",
        contractNumber: "П-22-04",
        contractDate: "22.04.2026",
        paymentTerms: "70% предоплата, 30% при отгрузке",
        deliveryMethod: "Самовывоз",
        signerRole: "Генеральный директор",
        signerName: "Нормуродов О.А.",
      })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;
    expect(workshop.nextSpecificationNumber).toBe(1);
    // Постоянные поля спецификации (владелец проекта, 2026-08-02) — заданы
    // один раз при создании цеха, должны подставляться в каждую сгенерированную
    // спецификацию вместо пустых строк (production-order-orchestration.service.ts).
    expect(workshop.paymentTerms).toBe("70% предоплата, 30% при отгрузке");
    expect(workshop.deliveryMethod).toBe("Самовывоз");
    expect(workshop.signerRole).toBe("Генеральный директор");
    expect(workshop.signerName).toBe("Нормуродов О.А.");

    // Шаг 1: текстовый запрос → разбор в объёмы по SKU (без ANTHROPIC_API_KEY
    // — RuleBasedAIClassifier, узкий размеченный формат).
    const requestText =
      "Создай спецификацию. Модель: Двойка. Цвета: Петроль — 1000 шт., Бордо — 500 шт. Размеры: 48-50, 52-54, 56-58, 60-62, 64-66. Цена пошива — 720 рублей.";

    const parseResponse = await request(httpServer)
      .post("/v1/production-requests/parse")
      .set(...authHeader(accessToken))
      .send({ text: requestText })
      .expect(201);
    const parsed = parseResponse.body as ParsedProductionRequestResponseDto;
    expect(parsed.items).toHaveLength(10);

    // Шаг 2: тот же текст → сразу черновик заказа пошива (резолв модели/BOM/SKU
    // из каталога).
    const createOrderResponse = await request(httpServer)
      .post("/v1/production-requests/create-order")
      .set(...authHeader(accessToken))
      .send({ text: requestText, workshopId: workshop.id })
      .expect(201);
    const order = createOrderResponse.body as ProductionOrderResponseDto;
    expect(order.status).toBe("draft");
    expect(order.productId).toBe(product.id);
    expect(order.bomId).toBe(bomDraft.id);
    expect(Number(order.plannedQuantity)).toBe(1500);
    expect(Number(order.agreedUnitPrice)).toBe(720);
    expect(order.variants).toHaveLength(10);

    // Показ заказа (GET, минимум Итерации 7).
    const getOrderResponse = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((getOrderResponse.body as ProductionOrderResponseDto).id).toBe(order.id);

    // Спецификацию нельзя сгенерировать для ещё не подтверждённого заказа.
    const specBeforeConfirmResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/generate-specification`)
      .set(...authHeader(accessToken))
      .expect(400);
    expect((specBeforeConfirmResponse.body as ErrorResponseBody).code).toBe("PRODUCTION_ORDER_NOT_PLACED");

    // Шаг 3: подтверждение — заказ размещён у цеха.
    const confirmResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    expect((confirmResponse.body as ProductionOrderResponseDto).status).toBe("placed");

    // Шаг 4: генерация PDF-спецификации по шаблону + привязка к заказу.
    const specResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/generate-specification`)
      .set(...authHeader(accessToken))
      .expect(201);
    const specDocument = specResponse.body as DocumentResponseDto;
    expect(specDocument.docType).toBe("specification");
    expect(specDocument.fileUrl.length).toBeGreaterThan(0);

    // Показ документов, привязанных к заказу (GET, минимум Итерации 7).
    const listDocsResponse = await request(httpServer)
      .get("/v1/documents")
      .query({ entityType: "production_order", entityId: order.id })
      .set(...authHeader(accessToken))
      .expect(200);
    const linkedDocuments = listDocsResponse.body as DocumentResponseDto[];
    expect(linkedDocuments).toHaveLength(1);
    expect(linkedDocuments[0]?.id).toBe(specDocument.id);

    // Каждая генерация — новая, отличная спецификация: номер по договору
    // цеха реально увеличивается, не переиспользуется (требование владельца
    // проекта 2026-07-26: "на каждую модель спецификация была разная
    // соответственно данные нумерация и даты").
    const [workshopAfterFirstSpec] = await db.select().from(workshops).where(eq(workshops.id, workshop.id));
    expect(workshopAfterFirstSpec?.nextSpecificationNumber).toBe(2);

    const secondSpecResponse = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/generate-specification`)
      .set(...authHeader(accessToken))
      .expect(201);
    const secondSpecDocument = secondSpecResponse.body as DocumentResponseDto;
    expect(secondSpecDocument.id).not.toBe(specDocument.id);

    const [workshopAfterSecondSpec] = await db.select().from(workshops).where(eq(workshops.id, workshop.id));
    expect(workshopAfterSecondSpec?.nextSpecificationNumber).toBe(3);

    // Шаг 5: привязка цеха к Telegram (инвайт-код → /start) + простой
    // текстовый ответ цеха → автоматическое обновление статуса заказа.
    const inviteResponse = await request(httpServer)
      .post(`/v1/telegram/invites/workshop/${workshop.id}`)
      .set(...authHeader(accessToken))
      .expect(201);
    const invite = inviteResponse.body as TelegramInviteResponseDto;

    const workshopChatId = "123456789";
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 1, message: { message_id: 1, chat: { id: workshopChatId }, text: `/start ${invite.code}` } })
      .expect(200);

    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 2, message: { message_id: 2, chat: { id: workshopChatId }, text: "Готово, можно забирать" } })
      .expect(200);

    const orderAfterWorkshopReply = await request(httpServer)
      .get(`/v1/production-orders/${order.id}`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect((orderAfterWorkshopReply.body as ProductionOrderResponseDto).status).toBe("ready_for_pickup");
  });

  // Pilot v1, этап 1. До появления PATCH /workshops/:id цех, заведённый
  // обычным путём (без договорных реквизитов), становился тупиком: заказ к
  // нему создавался, но подтвердиться не мог никогда, а исправить карточку
  // было нечем. Тест фиксирует обе стороны: инвариант продолжает работать и
  // теперь у него есть выход.
  it("цех без договора блокирует подтверждение заказа, PATCH карточки снимает блокировку", async () => {
    const companyName = `E2E Workshop Contract ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const product = (
      await request(httpServer)
        .post("/v1/products")
        .set(...authHeader(accessToken))
        .send({ name: "Стеганка", code: `STEG-${Date.now()}` })
        .expect(201)
    ).body as ProductResponseDto;

    const variantResponse = await request(httpServer)
      .post("/v1/product-variants")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, size: "M", color: "чёрный", skuCode: `STEG-M-${product.id.slice(0, 6)}` })
      .expect(201);
    const variantId = (variantResponse.body as { id: string }).id;

    const material = (
      await request(httpServer)
        .post("/v1/materials")
        .set(...authHeader(accessToken))
        .send({ name: "Стёганое полотно", type: "fabric", unit: "m" })
        .expect(201)
    ).body as MaterialResponseDto;

    const bomDraft = (
      await request(httpServer)
        .post("/v1/boms")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 2.6 }] })
        .expect(201)
    ).body as BomResponseDto;
    await request(httpServer)
      .post(`/v1/boms/${bomDraft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    // Цех заводится ровно так, как это делал интерфейс до этапа 1 — без
    // единого договорного поля.
    const workshop = (
      await request(httpServer)
        .post("/v1/workshops")
        .set(...authHeader(accessToken))
        .send({ name: "Цех без договора", inn: "0101", specialization: "стеганка" })
        .expect(201)
    ).body as WorkshopResponseDto;
    expect(workshop.contractNumber).toBeNull();

    const order = (
      await request(httpServer)
        .post("/v1/production-orders")
        .set(...authHeader(accessToken))
        .send({
          productId: product.id,
          bomId: bomDraft.id,
          workshopId: workshop.id,
          plannedQuantity: 12,
          agreedUnitPrice: 1234.5,
          variants: [{ productVariantId: variantId, quantity: 12 }],
        })
        .expect(201)
    ).body as ProductionOrderResponseDto;

    // Инвариант «основания генерации» продолжает действовать.
    const blocked = await request(httpServer)
      .post(`/v1/production-orders/${order.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(400);
    expect((blocked.body as ErrorResponseBody).code).toBe("WORKSHOP_CONTRACT_NUMBER_MISSING");

    const patched = (
      await request(httpServer)
        .patch(`/v1/workshops/${workshop.id}`)
        .set(...authHeader(accessToken))
        .send({
          contractNumber: "АС-2026/14",
          contractDate: "2026-08-01",
          paymentTerms: "Предоплата 70%, остаток по приёмке",
          signerRole: "Директор",
          signerName: "Абдыраимов К.А.",
        })
        .expect(200)
    ).body as WorkshopResponseDto;
    expect(patched.contractNumber).toBe("АС-2026/14");
    // Частичный PATCH не затирает поля, которых в нём не было.
    expect(patched.name).toBe("Цех без договора");
    expect(patched.inn).toBe("0101");
    expect(patched.specialization).toBe("стеганка");

    // Пустая строка очищает поле — иначе ошибочно введённый реквизит
    // остался бы в карточке навсегда.
    const cleared = (
      await request(httpServer)
        .patch(`/v1/workshops/${workshop.id}`)
        .set(...authHeader(accessToken))
        .send({ signerRole: "" })
        .expect(200)
    ).body as WorkshopResponseDto;
    expect(cleared.signerRole).toBeNull();
    expect(cleared.contractNumber).toBe("АС-2026/14");

    // Тот же заказ теперь подтверждается, а реквизиты попадают в Snapshot
    // партии — тот, из которого потом печатается спецификация.
    const confirmed = (
      await request(httpServer)
        .post(`/v1/production-orders/${order.id}/confirm`)
        .set(...authHeader(accessToken))
        .expect(201)
    ).body as ProductionOrderResponseDto;
    expect(confirmed.status).toBe("placed");
    expect(confirmed.costSnapshot?.contractNumber).toBe("АС-2026/14");
    expect(confirmed.costSnapshot?.contractDate).toBe("2026-08-01");
    expect(confirmed.costSnapshot?.paymentTerms).toBe("Предоплата 70%, остаток по приёмке");
    expect(confirmed.costSnapshot?.contractorSignerName).toBe("Абдыраимов К.А.");

    await request(httpServer)
      .patch("/v1/workshops/00000000-0000-4000-8000-000000000099")
      .set(...authHeader(accessToken))
      .send({ signerName: "нет такого цеха" })
      .expect(404);

    await request(httpServer)
      .patch(`/v1/workshops/${workshop.id}`)
      .set(...authHeader(accessToken))
      .send({})
      .expect(400);

    // Pilot v1, этап 3 — документ, пришедший извне, ложится в ту же партию
    // тем же Document Engine. Проверяется здесь, а не отдельным файлом,
    // потому что нужна уже подтверждённая партия из этого же сценария.
    const pdfBytes = Buffer.from("%PDF-1.7\n% подписанный скан\n%%EOF\n", "utf8");

    const uploaded = (
      await request(httpServer)
        .post("/v1/documents")
        .set(...authHeader(accessToken))
        .field("docType", "specification_signed")
        .field("entityType", "production_order")
        .field("entityId", order.id)
        .field("title", "Спецификация №1 (подписана)")
        .field("issuedAt", "2026-08-20")
        .attach("file", pdfBytes, "signed.pdf")
        .expect(201)
    ).body as DocumentResponseDto;
    expect(uploaded.docType).toBe("specification_signed");
    expect(uploaded.uploadedBy).not.toBeNull();
    expect(uploaded.isCurrentVersion).toBe(true);

    // Скачивается ровно то, что загружено — байт в байт.
    const downloaded = await request(httpServer)
      .get(`/v1/documents/${uploaded.id}/file`)
      .set(...authHeader(accessToken))
      .expect(200);
    expect(Buffer.from(downloaded.body as Buffer).equals(pdfBytes)).toBe(true);

    // Новая редакция не удаляет прежнюю: обе остаются в истории партии.
    const secondVersion = (
      await request(httpServer)
        .post("/v1/documents")
        .set(...authHeader(accessToken))
        .field("docType", "specification_signed")
        .field("entityType", "production_order")
        .field("entityId", order.id)
        .field("supersedesDocumentId", uploaded.id)
        .attach("file", pdfBytes, "signed-v2.pdf")
        .expect(201)
    ).body as DocumentResponseDto;
    expect(secondVersion.supersedesDocumentId).toBe(uploaded.id);

    const documentsOfOrder = (
      await request(httpServer)
        .get(`/v1/documents?entityType=production_order&entityId=${order.id}`)
        .set(...authHeader(accessToken))
        .expect(200)
    ).body as DocumentResponseDto[];
    const signedVersions = documentsOfOrder.filter((doc) => doc.docType === "specification_signed");
    expect(signedVersions).toHaveLength(2);
    expect(signedVersions.filter((doc) => doc.isCurrentVersion)).toHaveLength(1);

    // Файл обязателен, расширение проверяется — в хранилище не попадает
    // произвольный файл, который потом нечем открыть.
    await request(httpServer)
      .post("/v1/documents")
      .set(...authHeader(accessToken))
      .field("docType", "invoice")
      .field("entityType", "production_order")
      .field("entityId", order.id)
      .expect(400);

    await request(httpServer)
      .post("/v1/documents")
      .set(...authHeader(accessToken))
      .field("docType", "invoice")
      .field("entityType", "production_order")
      .field("entityId", order.id)
      .attach("file", Buffer.from("не документ", "utf8"), "note.txt")
      .expect(400);
  });
});
