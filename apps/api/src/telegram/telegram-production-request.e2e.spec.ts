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
  inboxChannels,
  materials,
  materialStockItems,
  materialStockMovements,
  productionOrders,
  productionOrderVariants,
  productVariants,
  products,
  purchaseOrderItems,
  purchaseOrders,
  refreshTokens,
  stockItems,
  stockMovements,
  suppliers,
  telegramInviteCodes,
  userRoles,
  users,
  warehouses,
  workshops,
} from "@garmentos/db-schema";
import type {
  BomResponseDto,
  MaterialResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  PurchaseOrderResponseDto,
  SupplierResponseDto,
  TelegramInviteResponseDto,
  WarehouseResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";
import { TELEGRAM_CLIENT } from "./telegram.tokens";
import { CANCEL_CALLBACK_DATA, CONFIRM_CALLBACK_DATA } from "./telegram.service";
import type { TelegramClient } from "./telegram-client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

const SIZES = ["48-50", "52-54"];

interface ErrorResponseBody {
  statusCode: number;
  code?: string;
  message: string;
}

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
  const sentMessages: { chatId: string; text: string; buttons: string[] }[] = [];
  const answeredCallbackQueryIds: string[] = [];
  // Подменяем реальный клиент шпионом — LoggingTelegramClient (по умолчанию,
  // без TELEGRAM_BOT_TOKEN) только логирует и не даёт проверить, что именно
  // отправлено; для проверки уведомления компании о статусе от цеха и
  // inline-кнопок предпросмотра (владелец проекта, 2026-08-02) нужно
  // перехватить фактические сообщения.
  const telegramClientSpy: TelegramClient = {
    sendMessage: (chatId, text, options) => {
      sentMessages.push({ chatId, text, buttons: options?.inlineKeyboard?.flat().map((button) => button.text) ?? [] });
      return Promise.resolve();
    },
    sendDocument: () => Promise.resolve(),
    answerCallbackQuery: (callbackQueryId: string) => {
      answeredCallbackQueryIds.push(callbackQueryId);
      return Promise.resolve();
    },
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
        const companyWarehouses = await db.select().from(warehouses).where(eq(warehouses.companyId, company.id));
        for (const warehouse of companyWarehouses) {
          const stockItemsForWarehouse = await db
            .select()
            .from(materialStockItems)
            .where(eq(materialStockItems.warehouseId, warehouse.id));
          for (const stockItem of stockItemsForWarehouse) {
            await db.delete(materialStockMovements).where(eq(materialStockMovements.materialStockItemId, stockItem.id));
          }
          await db.delete(materialStockItems).where(eq(materialStockItems.warehouseId, warehouse.id));
          const finishedStockItemsForWarehouse = await db
            .select()
            .from(stockItems)
            .where(eq(stockItems.warehouseId, warehouse.id));
          for (const stockItem of finishedStockItemsForWarehouse) {
            await db.delete(stockMovements).where(eq(stockMovements.stockItemId, stockItem.id));
          }
          await db.delete(stockItems).where(eq(stockItems.warehouseId, warehouse.id));
        }
        await db.delete(warehouses).where(eq(warehouses.companyId, company.id));
        const companyPurchaseOrders = await db.select().from(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        for (const purchaseOrder of companyPurchaseOrders) {
          await db.delete(purchaseOrderItems).where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrder.id));
        }
        await db.delete(purchaseOrders).where(eq(purchaseOrders.companyId, company.id));
        await db.delete(suppliers).where(eq(suppliers.companyId, company.id));
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

    // Остаток материала — проверка наличия ткани/фурнитуры в предпросмотре и
    // расход при подтверждении заказа (владелец проекта, 2026-08-02).
    // Единственный склад компании резолвится автоматически, так же как и цех.
    const warehouseResponse = await request(httpServer)
      .post("/v1/warehouses")
      .set(...authHeader(accessToken))
      .send({ name: "Склад материалов" })
      .expect(201);
    const warehouse = warehouseResponse.body as WarehouseResponseDto;

    const supplierResponse = await request(httpServer)
      .post("/v1/suppliers")
      .set(...authHeader(accessToken))
      .send({ name: "Поставщик тканей", type: "fabric" })
      .expect(201);
    const supplier = supplierResponse.body as SupplierResponseDto;

    // Заказано 100 шт (Молочный), норма расхода 1.1 м/шт без отходов —
    // требуется 110 м. Приходуем 150 м — заведомо достаточно.
    const purchaseOrderResponse = await request(httpServer)
      .post("/v1/purchase-orders")
      .set(...authHeader(accessToken))
      .send({ supplierId: supplier.id, items: [{ materialId: material.id, quantity: 150, unitPrice: 200 }] })
      .expect(201);
    const purchaseOrder = purchaseOrderResponse.body as PurchaseOrderResponseDto;
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/confirm`)
      .set(...authHeader(accessToken))
      .expect(201);
    await request(httpServer)
      .post(`/v1/purchase-orders/${purchaseOrder.id}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);

    const [stockAfterReceive] = await db
      .select()
      .from(materialStockItems)
      .where(and(eq(materialStockItems.warehouseId, warehouse.id), eq(materialStockItems.materialId, material.id)));
    expect(Number(stockAfterReceive?.quantityOnHand)).toBe(150);

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

    // Материала достаточно (150 на складе, требуется 110) — предупреждения о
    // нехватке в предпросмотре быть не должно.
    const previewMessage = sentMessages.find((sent) => sent.chatId === chatId && sent.text.includes("Я понял заказ"));
    expect(previewMessage?.text).not.toContain("Недостаточно материала");

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

    // Аудит (владелец проекта, 2026-08-04: "кто изменил партию, когда, что
    // изменил, старое/новое значение") — подтверждение через Telegram
    // происходит от имени компании, не конкретного человека (userId=null —
    // тот же принцип, что и остальной обмен с компанией через общий чат),
    // но источник действия зафиксирован.
    const confirmAuditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, orderId ?? ""), eq(auditLog.action, "production_order.confirmed")));
    expect(confirmAuditEntries).toHaveLength(1);
    expect(confirmAuditEntries[0]?.source).toBe("telegram");
    expect(confirmAuditEntries[0]?.userId).toBeNull();
    expect((confirmAuditEntries[0]?.afterJson as { status?: string } | null)?.status).toBe("placed");

    const specAuditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, orderId ?? ""), eq(auditLog.action, "document.specification_generated")));
    expect(specAuditEntries).toHaveLength(1);

    // Подтверждение заказа остаток НЕ меняет (владелец проекта, 2026-08-30):
    // это договорённость с цехом, а не расход ткани. Единственная точка
    // фактического списания — внесение факта раскроя, где известно, сколько
    // реально ушло. До этого решения здесь ожидалось 40 (150 − 110 по нормам),
    // причём только на Telegram-пути: веб-подтверждение не списывало вообще.
    const [stockAfterConfirm] = await db
      .select()
      .from(materialStockItems)
      .where(and(eq(materialStockItems.warehouseId, warehouse.id), eq(materialStockItems.materialId, material.id)));
    expect(Number(stockAfterConfirm?.quantityOnHand)).toBe(150);

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

    // Шаг 4: приёмка партии на склад (Итерация 10) — доступна только теперь,
    // когда цех сообщил "готово к отгрузке"; зачисляет каждый SKU заказа на
    // склад и переводит заказ в терминальный статус received.
    const receiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${orderId}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(201);
    const received = receiveResponse.body as ProductionOrderResponseDto;
    expect(received.status).toBe("received");
    expect(received.receivedAt).not.toBeNull();

    const totalReceivedQuantity = received.variants.reduce((sum, variant) => sum + Number(variant.quantity), 0);
    expect(totalReceivedQuantity).toBe(100);

    let stockOnHandAcrossVariants = 0;
    for (const variant of received.variants) {
      const [stockItem] = await db
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.warehouseId, warehouse.id), eq(stockItems.productVariantId, variant.productVariantId)));
      stockOnHandAcrossVariants += Number(stockItem?.quantityOnHand ?? 0);
    }
    expect(stockOnHandAcrossVariants).toBe(100);

    const receiveAuditEntries = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, orderId ?? ""), eq(auditLog.action, "production_order.received")));
    expect(receiveAuditEntries).toHaveLength(1);
    expect(receiveAuditEntries[0]?.source).toBe("http_api");

    // Повторная приёмка уже принятой партии запрещена.
    const repeatReceiveResponse = await request(httpServer)
      .post(`/v1/production-orders/${orderId}/receive`)
      .set(...authHeader(accessToken))
      .send({ warehouseId: warehouse.id })
      .expect(409);
    const repeatReceiveBody = repeatReceiveResponse.body as ErrorResponseBody;
    expect(repeatReceiveBody.code).toBe("PRODUCTION_ORDER_NOT_READY_FOR_PICKUP");
  });

  it("предпросмотр содержит inline-кнопки, подтверждение и отмена работают через нажатие кнопки", async () => {
    const companyName = `E2E Telegram Buttons ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const productResponse = await request(httpServer)
      .post("/v1/products")
      .set(...authHeader(accessToken))
      .send({ name: "Свитшот", code: `SWEATSHIRT-${Date.now()}` })
      .expect(201);
    const product = productResponse.body as ProductResponseDto;

    for (const size of SIZES) {
      await request(httpServer)
        .post("/v1/product-variants")
        .set(...authHeader(accessToken))
        .send({ productId: product.id, size, color: "Серый", skuCode: `SWEATSHIRT-${size}-${product.id.slice(0, 4)}` })
        .expect(201);
    }

    const materialResponse = await request(httpServer)
      .post("/v1/materials")
      .set(...authHeader(accessToken))
      .send({ name: "Футер", type: "fabric", unit: "m" })
      .expect(201);
    const material = materialResponse.body as MaterialResponseDto;

    const bomResponse = await request(httpServer)
      .post("/v1/boms")
      .set(...authHeader(accessToken))
      .send({ productId: product.id, items: [{ materialId: material.id, quantityPerUnit: 1 }] })
      .expect(201);
    const bomDraft = bomResponse.body as BomResponseDto;
    await request(httpServer)
      .post(`/v1/boms/${bomDraft.id}/approve`)
      .set(...authHeader(accessToken))
      .expect(201);

    await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(accessToken))
      // contractNumber обязателен для подтверждения заказа (Snapshot партии,
      // owner 2026-08-03 — без него спецификация не может быть выпущена).
      .send({ name: "Цех Кнопки", contractNumber: "Д-2" })
      .expect(201);

    const inviteResponse = await request(httpServer)
      .post("/v1/telegram/invites/company")
      .set(...authHeader(accessToken))
      .expect(201);
    const invite = inviteResponse.body as TelegramInviteResponseDto;

    const chatId = "555000333";
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 20, message: { message_id: 20, chat: { id: chatId }, text: `/start ${invite.code}` } })
      .expect(200);

    const requestText = "Модель: Свитшот. Цвета: Серый — 20 шт. Размеры: 48-50, 52-54. Цена пошива — 600 рублей.";

    // Раунд 1: предпросмотр → отмена кнопкой "❌ Отменить" — заказ не создаётся.
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 21, message: { message_id: 21, chat: { id: chatId }, text: requestText } })
      .expect(200);

    const firstPreview = sentMessages.find((sent) => sent.chatId === chatId && sent.text.includes("Я понял заказ"));
    expect(firstPreview?.buttons).toEqual(["✅ Подтвердить", "❌ Отменить"]);

    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({
        update_id: 22,
        callback_query: { id: "callback-cancel-1", data: CANCEL_CALLBACK_DATA, message: { message_id: 22, chat: { id: chatId } } },
      })
      .expect(200);
    expect(answeredCallbackQueryIds).toContain("callback-cancel-1");

    const [companyAfterCancel] = await db.select().from(companies).where(eq(companies.name, companyName));
    const ordersAfterCancel = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.companyId, companyAfterCancel?.id ?? ""));
    expect(ordersAfterCancel).toHaveLength(0);

    // Раунд 2: новый предпросмотр → подтверждение кнопкой "✅ Подтвердить" —
    // заказ создаётся, как и при текстовом "Да".
    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({ update_id: 23, message: { message_id: 23, chat: { id: chatId }, text: requestText } })
      .expect(200);

    await request(httpServer)
      .post("/v1/telegram/webhook")
      .send({
        update_id: 24,
        callback_query: { id: "callback-confirm-1", data: CONFIRM_CALLBACK_DATA, message: { message_id: 24, chat: { id: chatId } } },
      })
      .expect(200);
    expect(answeredCallbackQueryIds).toContain("callback-confirm-1");

    const ordersAfterConfirmButton = await db
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.companyId, companyAfterCancel?.id ?? ""));
    expect(ordersAfterConfirmButton).toHaveLength(1);
    expect(ordersAfterConfirmButton[0]?.status).toBe("placed");
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
