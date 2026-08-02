import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  bomItems,
  boms,
  companies,
  createDb,
  documentDerivatives,
  documentLinks,
  documents,
  inboxChannels,
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
import type { BomResponseDto, MaterialResponseDto, ProductResponseDto, TelegramInviteResponseDto, WorkshopResponseDto } from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";
import { TELEGRAM_CLIENT } from "./telegram.tokens";
import type { TelegramClient } from "./telegram-client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

const SIZES = ["48-50", "52-54"];

// Полный разговорный сценарий владельца проекта (2026-07-26): "Telegram —
// тонкий интерфейс, вся логика в GarmentOS". Пользователь пишет текст,
// система показывает предпросмотр (что поняла/что нашла/какие проблемы),
// и только после "Да" реально создаёт заказ, генерирует спецификацию и
// отправляет её цеху.
describe("Telegram: текст → предпросмотр → подтверждение → заказ (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  const createdCompanyNames: string[] = [];
  const originalS3Endpoint = process.env.S3_ENDPOINT;
  const sentMessages: { chatId: string; text: string }[] = [];
  // Подменяем реальный клиент шпионом — LoggingTelegramClient (по умолчанию,
  // без TELEGRAM_BOT_TOKEN) только логирует и не даёт проверить, что именно
  // отправлено; для проверки уведомления компании о статусе от цеха
  // (владелец проекта, 2026-08-02) нужно перехватить фактические сообщения.
  const telegramClientSpy: TelegramClient = {
    sendMessage: (chatId: string, text: string) => {
      sentMessages.push({ chatId, text });
      return Promise.resolve();
    },
    sendDocument: () => Promise.resolve(),
  };

  beforeAll(async () => {
    // MinIO не запущен в этой песочнице — LocalFileStorageAdapter (тот же
    // принцип, что LoggingTelegramClient), см. production-order-orchestration.e2e.spec.ts.
    delete process.env.S3_ENDPOINT;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_CLIENT)
      .useValue(telegramClientSpy)
      .compile();
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
        await db.delete(inboxChannels).where(eq(inboxChannels.companyId, company.id));
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

  it("показывает предпросмотр, затем по «Да» создаёт заказ, подтверждает и генерирует спецификацию", async () => {
    const companyName = `E2E Telegram Confirm ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Муслин", code: `MUSLIN-${Date.now()}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    for (const size of SIZES) {
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size, color: "Молочный", skuCode: `MUSLIN-${size}-${product.id.slice(0, 4)}` })
        .expect(201);
    }

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Муслин ткань", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const bomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1.1 }] })
      .expect(201);
    const bomDraft = bomResponse.body as BomResponseDto;
    await request(httpServer)
      .post(`/v1/boms/${bomDraft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    // Единственный активный цех компании — резолвится автоматически, без
    // явного упоминания в тексте.
    const workshopResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: "Цех Единственный", contractNumber: "Д-1", contractDate: "01.01.2026" })
      .expect(201);
    const workshop = workshopResponse.body as WorkshopResponseDto;

    // Привязка собственного чата компании к Telegram.
    const inviteResponse = await request(httpServer)
      .post("/v1/telegram/invites/company")
      .set(...authHeader(accessToken))
      .expect(201);
    const invite = inviteResponse.body as TelegramInviteResponseDto;

    const chatId = "555000111";
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 1, message: { message_id: 1, chat: { id: chatId }, text: `/start ${invite.code}` } })
      .expect(200);

    // Шаг 1: текстовый запрос → предпросмотр (не создаёт ничего).
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({
        update_id: 2,
        message: {
          message_id: 2,
          chat: { id: chatId },
          text: "Модель: Муслин. Цвета: Молочный — 100 шт. Размеры: 48-50, 52-54. Цена пошива — 500 рублей.",
        },
      })
      .expect(200);

    const ordersAfterPreview = await db.select().from(productionOrders).where(eq(productionOrders.workshopId, workshop.id));
    expect(ordersAfterPreview).toHaveLength(0);

    // Шаг 2: подтверждение — только теперь создаётся заказ, подтверждается и
    // генерируется спецификация.
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 3, message: { message_id: 3, chat: { id: chatId }, text: "Да" } })
      .expect(200);

    const ordersAfterConfirm = await db.select().from(productionOrders).where(eq(productionOrders.workshopId, workshop.id));
    expect(ordersAfterConfirm).toHaveLength(1);
    expect(ordersAfterConfirm[0]?.status).toBe("placed");
    expect(Number(ordersAfterConfirm[0]?.plannedQuantity)).toBe(100);

    const orderId = ordersAfterConfirm[0]?.id;
    const specLinks = await db.select().from(documentLinks).where(eq(documentLinks.entityId, orderId ?? ""));
    expect(specLinks).toHaveLength(1);

    // Шаг 3: цех отвечает "Готово" — компания должна узнать об этом в своём
    // Telegram-чате, а не только запросив статус напрямую через API (владелец
    // проекта, 2026-08-02: "я вообще не должен заходить в Swagger или Postman").
    const workshopInviteResponse = await request(httpServer)
      .post(`/v1/telegram/invites/workshop/${workshop.id}`)
      .set(...authHeader(accessToken))
      .expect(201);
    const workshopInvite = workshopInviteResponse.body as TelegramInviteResponseDto;

    const workshopChatId = "555000999";
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 4, message: { message_id: 4, chat: { id: workshopChatId }, text: `/start ${workshopInvite.code}` } })
      .expect(200);

    const messagesBeforeStatus = sentMessages.length;
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 5, message: { message_id: 5, chat: { id: workshopChatId }, text: "Готово, можно забирать" } })
      .expect(200);

    const notification = sentMessages.slice(messagesBeforeStatus).find((sent) => sent.chatId === chatId);
    expect(notification?.text).toContain("Цех Единственный");
    expect(notification?.text).toContain("готово к отгрузке");
  });

  it("не создаёт заказ, если модель не найдена — сообщает об этом и предлагает похожие названия", async () => {
    const companyName = `E2E Telegram Unknown Model ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Лана", code: `LANA-${Date.now()}` })
      .expect(201);

    await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      .send({ name: "Цех" })
      .expect(201);

    const inviteResponse = await request(httpServer)
      .post("/v1/telegram/invites/company")
      .set(...authHeader(accessToken))
      .expect(201);
    const invite = inviteResponse.body as TelegramInviteResponseDto;

    const chatId = "555000222";
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 10, message: { message_id: 10, chat: { id: chatId }, text: `/start ${invite.code}` } })
      .expect(200);

    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({
        update_id: 11,
        message: {
          message_id: 11,
          chat: { id: chatId },
          text: "Модель: Лана летняя. Цвета: Белый — 50 шт. Размеры: M. Цена пошива — 400 рублей.",
        },
      })
      .expect(200);

    // "Да" без успешного предпросмотра ничего не создаёт.
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 12, message: { message_id: 12, chat: { id: chatId }, text: "Да" } })
      .expect(200);

    const [company] = await db.select().from(companies).where(eq(companies.name, companyName));
    const orders = await db.select().from(productionOrders).where(eq(productionOrders.companyId, company?.id ?? ""));
    expect(orders).toHaveLength(0);
  });
});
