import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, refreshTokens, userRoles, users } from "@garmentos/db-schema";
import type { ParsedProductionRequestResponseDto } from "@garmentos/shared-types";
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

describe("Production Requests API (e2e)", () => {
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

  it("разбирает текстовый производственный запрос в объёмы по цвету/размеру (без ANTHROPIC_API_KEY — RuleBasedAIClassifier)", async () => {
    const companyName = `E2E Production Requests ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const response = await request(httpServer)
      .post("/v1/production-requests/parse")
      .set(...authHeader(accessToken))
      .send({
        text: "Создай спецификацию. Модель: Двойка. Цвета: Петроль — 1000 шт., Бордо — 500 шт. Размеры: 48–50, 52–54, 56–58, 60–62, 64–66. Цена пошива — 720 рублей.",
      })
      .expect(201);

    const parsed = response.body as ParsedProductionRequestResponseDto;
    expect(parsed.modelName).toBe("Двойка");
    expect(parsed.unitPrice).toBe(720);
    expect(parsed.items).toHaveLength(10);
    expect(parsed.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(1500);
  });

  it("возвращает 400 при неразмеченном тексте", async () => {
    const companyName = `E2E Production Requests Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const response = await request(httpServer)
      .post("/v1/production-requests/parse")
      .set(...authHeader(accessToken))
      .send({ text: "Просто текст без разметки" })
      .expect(400);

    expect((response.body as ErrorResponseBody).code).toBe("PRODUCTION_REQUEST_UNPARSEABLE");
  });
});
