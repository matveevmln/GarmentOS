import { config as loadEnv } from "dotenv";

loadEnv({ path: "../../.env" });

import "reflect-metadata";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "./app.module";

// Временный E2E-раннер (ПРОМПТ №14.5, автономный прогон №14.6.3-style) —
// НЕ часть постоянной архитектуры, удаляется сразу после использования.
//
// Причина существования: подтвердить persistence PostgreSQL + файла
// документа в Railway Preview через РЕАЛЬНЫЕ HTTP-контракты API, без
// внешнего сетевого доступа (недоступен из текущей CI/агентной среды —
// см. №14.5) и без публикации нового HTTP-эндпоинта. Вместо реального
// сетевого запроса поднимает тот же Nest-контекст и делает запросы через
// supertest against app.getHttpServer() — ровно тот же паттерн, что уже
// используют все *.e2e.spec.ts в этом репозитории (см.
// apps/api/src/catalog/product-passport.e2e.spec.ts, beforeAll) — не
// параллельный, не сокращённый путь: те же guard'ы, тот же контроллер,
// та же валидация, что видит настоящий клиент.
//
// Пароль QA-владельца берётся ТОЛЬКО из process.env.PREVIEW_QA_OWNER_PASSWORD
// и никогда не передаётся как CLI-аргумент и не логируется.
const REQUIRED_ENV_VARS = ["PREVIEW_QA_OWNER_EMAIL", "PREVIEW_QA_OWNER_PASSWORD"] as const;

// Небольшой настоящий валидный PNG (1×1 пиксель) — реальный файл, не
// выдуманная байтовая строка.
const TEST_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

interface LoginResponseBody {
  accessToken: string;
}
interface IdResponseBody {
  id: string;
}
interface DocumentListItem {
  id: string;
}

function bufferBody(res: request.Response): Buffer {
  return res.body as Buffer;
}

function parseBinary(res: request.Test): request.Test {
  return res.buffer(true).parse((response, callback) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => callback(null, Buffer.concat(chunks)));
  });
}

function finish(ok: boolean, summary: Record<string, string | number | boolean>): void {
  console.log("");
  console.log(ok ? "=== RESULT: OK ===" : "=== RESULT: MISMATCH ===");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`${key}=${String(value)}`);
  }
  process.exitCode = ok ? 0 : 1;
}

async function runBefore(httpServer: Server, accessToken: string): Promise<void> {
  console.log("== Create test product ==");
  const productRes = await request(httpServer)
    .post("/v1/products")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name: "__PERSISTENCE_E2E_TEST__", code: `PERSISTENCE-E2E-${Date.now()}` });
  if (productRes.status !== 201) {
    console.error(`Product creation failed: status=${productRes.status} body=${JSON.stringify(productRes.body)}`);
    process.exitCode = 1;
    return;
  }
  const productId = (productRes.body as IdResponseBody).id;
  console.log(`Product created: ${productId}`);

  const fileBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const originalSha256 = createHash("sha256").update(fileBuffer).digest("hex");
  console.log(`Test file size=${fileBuffer.length} sha256=${originalSha256}`);

  console.log("== Upload document (photo_product) ==");
  const docRes = await request(httpServer)
    .post("/v1/documents")
    .set("Authorization", `Bearer ${accessToken}`)
    .field("docType", "photo_product")
    .field("entityType", "product")
    .field("entityId", productId)
    .attach("file", fileBuffer, { filename: "persistence-e2e.png", contentType: "image/png" });
  if (docRes.status !== 201) {
    console.error(`Document upload failed: status=${docRes.status} body=${JSON.stringify(docRes.body)}`);
    process.exitCode = 1;
    return;
  }
  const documentId = (docRes.body as IdResponseBody).id;
  console.log(`Document uploaded: ${documentId}`);

  console.log("== Verify BEFORE: document list for entity ==");
  const listRes = await request(httpServer)
    .get("/v1/documents")
    .query({ entityType: "product", entityId: productId })
    .set("Authorization", `Bearer ${accessToken}`);
  const listBody = listRes.body as DocumentListItem[];
  const listOk = listRes.status === 200 && Array.isArray(listBody) && listBody.some((d) => d.id === documentId);
  console.log(`Document list status=${listRes.status} containsDocument=${listOk}`);

  console.log("== Verify BEFORE: fetch file + checksum ==");
  const fileRes = await parseBinary(request(httpServer).get(`/v1/documents/${documentId}/file`).set("Authorization", `Bearer ${accessToken}`));
  const fetchedSha256 = createHash("sha256").update(bufferBody(fileRes)).digest("hex");
  const matchBefore = fetchedSha256 === originalSha256;

  finish(listOk && matchBefore, {
    PRODUCT_ID: productId,
    DOCUMENT_ID: documentId,
    ORIGINAL_SHA256: originalSha256,
    FETCHED_SHA256_BEFORE: fetchedSha256,
    LIST_CONTAINS_DOCUMENT_BEFORE: listOk,
    MATCH_BEFORE: matchBefore,
  });
}

async function runAfter(httpServer: Server, accessToken: string): Promise<void> {
  const productId = process.argv[3];
  const documentId = process.argv[4];
  const originalSha256 = process.argv[5];
  if (!productId || !documentId || !originalSha256) {
    console.error("Для режима 'after' нужны позиционные аргументы: productId documentId originalSha256");
    process.exitCode = 1;
    return;
  }

  console.log("== Verify AFTER restart: product exists (Postgres persistence) ==");
  const productRes = await request(httpServer).get(`/v1/products/${productId}`).set("Authorization", `Bearer ${accessToken}`);
  const productBody = productRes.body as IdResponseBody;
  const productOk = productRes.status === 200 && productBody.id === productId;
  console.log(`Product GET status=${productRes.status} ok=${productOk}`);

  console.log("== Verify AFTER restart: document + document_link persistence ==");
  const listRes = await request(httpServer)
    .get("/v1/documents")
    .query({ entityType: "product", entityId: productId })
    .set("Authorization", `Bearer ${accessToken}`);
  const listBody = listRes.body as DocumentListItem[];
  const listOk = listRes.status === 200 && Array.isArray(listBody) && listBody.some((d) => d.id === documentId);
  console.log(`Document list status=${listRes.status} containsDocument=${listOk}`);

  console.log("== Verify AFTER restart: fetch file + checksum ==");
  const fileRes = await parseBinary(request(httpServer).get(`/v1/documents/${documentId}/file`).set("Authorization", `Bearer ${accessToken}`));
  const fetchedSha256After = createHash("sha256").update(bufferBody(fileRes)).digest("hex");
  const matchAfter = fetchedSha256After === originalSha256;

  finish(productOk && listOk && matchAfter, {
    PRODUCT_STATUS: productRes.status,
    PRODUCT_OK: productOk,
    DOCUMENT_LIST_STATUS: listRes.status,
    LIST_CONTAINS_DOCUMENT_AFTER: listOk,
    FETCHED_SHA256_AFTER: fetchedSha256After,
    MATCH_AFTER: matchAfter,
  });
}

async function main(): Promise<void> {
  for (const name of REQUIRED_ENV_VARS) {
    if (!process.env[name]) {
      console.error(`Отсутствует обязательная переменная окружения: ${name}`);
      process.exit(1);
    }
  }
  const email = process.env.PREVIEW_QA_OWNER_EMAIL!;
  const password = process.env.PREVIEW_QA_OWNER_PASSWORD!;

  const mode = process.argv[2];
  if (mode !== "before" && mode !== "after") {
    console.error("Использование: node preview-e2e-check.script.js <before|after> [productId] [documentId] [originalSha256]");
    process.exit(1);
  }

  // Та же существующая миграция, тем же существующим механизмом — как
  // отдельный процесс, без секретов в аргументах.
  const migrateResult = spawnSync("pnpm", ["--filter", "@garmentos/db-schema", "db:migrate"], { stdio: "inherit" });
  if (migrateResult.status !== 0) {
    console.error("Миграция завершилась с ошибкой, дальше не продолжаю.");
    process.exit(migrateResult.status ?? 1);
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  await app.init();
  const httpServer = app.getHttpServer() as Server;

  console.log("== Login ==");
  const loginRes = await request(httpServer).post("/v1/auth/login").send({ email, password });
  if (loginRes.status !== 200) {
    console.error(`Login failed: status=${loginRes.status} body=${JSON.stringify(loginRes.body)}`);
    process.exitCode = 1;
    return;
  }
  const accessToken = (loginRes.body as LoginResponseBody).accessToken;
  console.log("Login OK.");

  if (mode === "before") {
    await runBefore(httpServer, accessToken);
  } else {
    await runAfter(httpServer, accessToken);
  }

  // Намеренно НЕ ждём app.close() — supertest/superagent иногда держит
  // keep-alive сокеты, из-за которых закрытие Nest-приложения зависает
  // навсегда, а вместе с ним и вся цепочка "check && node dist/main.js"
  // (найдено в этом же прогоне — деплой завис именно на этом шаге).
  // Процесс всё равно завершается сразу следующей строкой — закрывать
  // тестовый HTTP-сервер отдельно не нужно, ОС освобождает сокеты при
  // выходе процесса.
}

main()
  .catch((error: unknown) => {
    console.error("Ошибка Preview E2E check:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
