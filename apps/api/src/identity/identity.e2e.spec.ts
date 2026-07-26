import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { auditLog, companies, createDb, refreshTokens, userRoles, users } from "@garmentos/db-schema";
import type { UserResponseDto } from "@garmentos/shared-types";
import { and, eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

// E2e-тест реального HTTP-слоя (не мок use case) на реальном Postgres —
// apps/api владеет собственным подключением через DI (DatabaseModule), не
// доступным тесту напрямую как управляемая транзакция (в отличие от
// packages/domain/*, где тест сам открывает транзакцию и откатывает её) —
// поэтому очистка здесь явная, через прямые DELETE после теста.
//
// Публичного HTTP-эндпоинта для создания компании больше нет (Итерация 5,
// docs/AUTH_ARCHITECTURE.md, раздел 9) — первая компания создаётся только
// через CLI-скрипт bootstrap-company.script.ts. Здесь компания создаётся
// напрямую в БД, тем же способом, что и в CLI-скрипте и в setupAuthenticatedCompany.
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

describe("Identity API (e2e)", () => {
  let app: INestApplication;
  let httpServer: Server;
  const createdCompanyNames: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts не запускается в e2e-тесте (тестовое приложение собирается
    // напрямую из AppModule) — версионирование нужно включить здесь так же,
    // как в bootstrap(), иначе /v1/... маршруты не зарегистрируются.
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    for (const name of createdCompanyNames) {
      const [company] = await db.select().from(companies).where(eq(companies.name, name));
      if (company) {
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

  it("owner создаёт второго пользователя через POST /v1/users, дубликат email — 409", async () => {
    const companyName = `E2E Тест ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const userResponse = await request(httpServer)
      .post("/v1/users")
      .set(...authHeader(accessToken))
      .send({ email: "E2E.Owner@Example.com", password: "supersecret123", fullName: "Е2е Тестовый" })
      .expect(201);
    const user = userResponse.body as UserResponseDto;
    expect(user.email).toBe("e2e.owner@example.com");
    expect(user).not.toHaveProperty("passwordHash");

    // Итерация 6: создание пользователя через HTTP API — источник "http_api",
    // инициатор — owner, который его создал (docs/AUTH_ARCHITECTURE.md, раздел 13).
    const [createUserAuditRow] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, user.id), eq(auditLog.action, "identity.create_user")));
    expect(createUserAuditRow?.source).toBe("http_api");
    expect(createUserAuditRow?.beforeJson).toBeNull();

    const conflictResponse = await request(httpServer)
      .post("/v1/users")
      .set(...authHeader(accessToken))
      .send({ email: "e2e.owner@example.com", password: "anotherpassword", fullName: "Другой" })
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("USER_EMAIL_TAKEN");
  });

  it("POST /v1/users с пустым fullName — 400; director без identity.write — 403", async () => {
    const companyName = `E2E Тест Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    await request(httpServer)
      .post("/v1/users")
      .set(...authHeader(accessToken))
      .send({ email: "invalid@example.com", password: "supersecret123", fullName: "" })
      .expect(400);

    // identity.write — только у owner (docs/AUTH_ARCHITECTURE.md, раздел 6):
    // даже director, у которого RW на все остальные 10 модулей, не может
    // управлять составом пользователей компании.
    const { accessToken: directorToken } = await setupAuthenticatedCompany(
      db,
      httpServer,
      `${companyName} Director`,
      "director",
    );
    await request(httpServer)
      .post("/v1/users")
      .set(...authHeader(directorToken))
      .send({ email: "director-attempt@example.com", password: "supersecret123", fullName: "Директор" })
      .expect(403);
  });
});
