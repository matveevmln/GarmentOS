import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, refreshTokens, userRoles, users } from "@garmentos/db-schema";
import type { PilotDashboardResponseDto } from "@garmentos/shared-types";
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

// Pilot Dashboard (владелец проекта, 2026-08-04) — только честность контракта
// на пустой компании: нули там, где реально нули, null там, где источника
// данных сознательно нет (мониторинг ошибок/маркер бэкапа), не выдуманные
// значения. Сценарий "партия действительно проведена через дашборд" уже
// покрыт e2e Telegram/Contract Manufacturing — здесь не дублируется.
describe("Pilot Dashboard API (e2e)", () => {
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

  it("на свежей компании без партий возвращает честные нули и null там, где нет источника данных", async () => {
    const companyName = `E2E Pilot Dashboard ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "owner");

    const response = await request(httpServer)
      .get("/v1/pilot-dashboard")
      .set(...authHeader(accessToken))
      .expect(200);
    const dashboard = response.body as PilotDashboardResponseDto;

    expect(dashboard.productionOrdersToday).toBe(0);
    expect(dashboard.inProgressCount).toBe(0);
    expect(dashboard.overdueCount).toBe(0);
    expect(dashboard.lastSpecificationNumber).toBeNull();
    expect(dashboard.lastSpecificationAt).toBeNull();
    expect(dashboard.lastSnapshotAt).toBeNull();
    // Сознательно не подключены на пилоте — см. pilot-dashboard.service.ts.
    expect(dashboard.errorsToday).toBeNull();
    expect(dashboard.lastBackupAt).toBeNull();
  });
});
