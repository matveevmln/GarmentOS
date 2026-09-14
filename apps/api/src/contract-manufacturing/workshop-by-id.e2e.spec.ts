import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, refreshTokens, userRoles, users, workshops } from "@garmentos/db-schema";
import type { WorkshopResponseDto } from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

// GET /workshops/:id (Этап 2 — «Паспорт модели», владелец проекта,
// 2026-09-12) — недостающий минимальный эндпоинт, понадобившийся карточке
// спецификации (открывается по прямой ссылке, без предзагруженного списка).
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

describe("GET /workshops/:id (e2e)", () => {
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
      if (!company) continue;
      await db.delete(workshops).where(eq(workshops.companyId, company.id));
      const companyUsers = await db.select().from(users).where(eq(users.companyId, company.id));
      for (const user of companyUsers) {
        await db.delete(refreshTokens).where(eq(refreshTokens.userId, user.id));
        await db.delete(userRoles).where(eq(userRoles.userId, user.id));
      }
      await db.delete(users).where(eq(users.companyId, company.id));
      await db.delete(companies).where(eq(companies.id, company.id));
    }
    await app.close();
  });

  it("отдаёт цех своей компании; чужая компания получает 404", async () => {
    const companyAName = `E2E Workshop ById A ${Date.now()}`;
    const companyBName = `E2E Workshop ById B ${Date.now()}`;
    createdCompanyNames.push(companyAName, companyBName);
    const { accessToken: tokenA } = await setupAuthenticatedCompany(db, httpServer, companyAName, "owner");
    const { accessToken: tokenB } = await setupAuthenticatedCompany(db, httpServer, companyBName, "owner");

    const createResponse = await request(httpServer)
      .post("/v1/workshops")
      .set(...authHeader(tokenA))
      .send({ name: "Ак-Сарай Текстиль", contractNumber: "П-22-04" })
      .expect(201);
    const workshop = createResponse.body as WorkshopResponseDto;

    const foundResponse = await request(httpServer)
      .get(`/v1/workshops/${workshop.id}`)
      .set(...authHeader(tokenA))
      .expect(200);
    expect((foundResponse.body as WorkshopResponseDto).name).toBe("Ак-Сарай Текстиль");

    const notFoundResponse = await request(httpServer)
      .get(`/v1/workshops/${workshop.id}`)
      .set(...authHeader(tokenB))
      .expect(404);
    expect((notFoundResponse.body as ErrorResponseBody).code).toBe("WORKSHOP_NOT_FOUND");
  });
});
