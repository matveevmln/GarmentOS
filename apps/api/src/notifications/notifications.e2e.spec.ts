import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, notifications, refreshTokens, userRoles, users } from "@garmentos/db-schema";
import type { NotificationResponseDto } from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { addUserToCompany, authHeader, setupAuthenticatedCompany } from "../test-support/auth-test-helper";

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

describe("Notifications API (e2e)", () => {
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
        await db.delete(notifications).where(eq(notifications.companyId, company.id));
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

  it("создаёт уведомление и отмечает его прочитанным; повторная отметка — 409", async () => {
    const companyName = `E2E Notifications ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { userId, accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "viewer");

    const notificationResponse = await request(httpServer)
      .post("/v1/notifications")
      .set(...authHeader(accessToken))
      .send({ userId, type: "low_stock", payloadJson: { productVariantId: "sku-1" } })
      .expect(201);
    const notification = notificationResponse.body as NotificationResponseDto;
    expect(notification.readAt).toBeNull();

    const readResponse = await request(httpServer)
      .post(`/v1/notifications/${notification.id}/read`)
      .set(...authHeader(accessToken))
      .expect(201);
    const read = readResponse.body as NotificationResponseDto;
    expect(read.readAt).not.toBeNull();

    const conflictResponse = await request(httpServer)
      .post(`/v1/notifications/${notification.id}/read`)
      .set(...authHeader(accessToken))
      .expect(409);
    expect((conflictResponse.body as ErrorResponseBody).code).toBe("NOTIFICATION_ALREADY_READ");
  });

  it("POST /v1/notifications с пустым type — 400; другой пользователь не может отметить чужое уведомление — 404", async () => {
    const companyName = `E2E Notifications Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { companyId, userId, accessToken } = await setupAuthenticatedCompany(db, httpServer, companyName, "viewer");

    await request(httpServer)
      .post("/v1/notifications")
      .set(...authHeader(accessToken))
      .send({ userId, type: "" })
      .expect(400);

    // notifications не подчиняется ролевой матрице (docs/AUTH_ARCHITECTURE.md,
    // раздел 7) — доступ определяется владением: второй пользователь той же
    // компании не может отметить прочитанным чужое уведомление.
    const notificationResponse = await request(httpServer)
      .post("/v1/notifications")
      .set(...authHeader(accessToken))
      .send({ userId, type: "low_stock" })
      .expect(201);
    const notification = notificationResponse.body as NotificationResponseDto;

    const { accessToken: otherUserToken } = await addUserToCompany(db, httpServer, companyId, "viewer");
    const forbiddenResponse = await request(httpServer)
      .post(`/v1/notifications/${notification.id}/read`)
      .set(...authHeader(otherUserToken))
      .expect(404);
    expect((forbiddenResponse.body as ErrorResponseBody).code).toBe("NOTIFICATION_NOT_FOUND");
  });
});
