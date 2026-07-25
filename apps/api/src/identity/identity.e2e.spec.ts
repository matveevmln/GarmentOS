import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, users } from "@garmentos/db-schema";
import type { CompanyResponseDto, UserResponseDto } from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";

// E2e-тест реального HTTP-слоя (не мок use case) на реальном Postgres —
// apps/api владеет собственным подключением через DI (DatabaseModule), не
// доступным тесту напрямую как управляемая транзакция (в отличие от
// packages/domain/*, где тест сам открывает транзакцию и откатывает её) —
// поэтому очистка здесь явная, через прямые DELETE после теста.
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
        await db.delete(users).where(eq(users.companyId, company.id));
        await db.delete(companies).where(eq(companies.id, company.id));
      }
    }
    await app.close();
  });

  it("POST /v1/companies создаёт компанию, POST /v1/users создаёт пользователя, дубликат email — 409", async () => {
    const companyName = `E2E Тест ${Date.now()}`;
    createdCompanyNames.push(companyName);

    const companyResponse = await request(httpServer)
      .post("/v1/companies")
      .send({ name: companyName, defaultCurrency: "RUB" })
      .expect(201);
    const company = companyResponse.body as CompanyResponseDto;
    expect(company.name).toBe(companyName);
    expect(company.defaultCurrency).toBe("RUB");

    const userResponse = await request(httpServer)
      .post("/v1/users")
      .send({
        companyId: company.id,
        email: "E2E.Owner@Example.com",
        password: "supersecret123",
        fullName: "Е2е Тестовый",
      })
      .expect(201);
    const user = userResponse.body as UserResponseDto;
    expect(user.email).toBe("e2e.owner@example.com");
    expect(user).not.toHaveProperty("passwordHash");

    const conflictResponse = await request(httpServer)
      .post("/v1/users")
      .send({
        companyId: company.id,
        email: "e2e.owner@example.com",
        password: "anotherpassword",
        fullName: "Другой",
      })
      .expect(409);
    const conflictBody = conflictResponse.body as ErrorResponseBody;
    expect(conflictBody.code).toBe("USER_EMAIL_TAKEN");
  });

  it("POST /v1/companies с пустым именем — 400", async () => {
    await request(httpServer).post("/v1/companies").send({ name: "" }).expect(400);
  });
});
