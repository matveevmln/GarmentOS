import { config } from "dotenv";

config({ path: "../../.env" });

import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { companies, createDb, notifications, users } from "@garmentos/db-schema";
import type { CompanyResponseDto, NotificationResponseDto, UserResponseDto } from "@garmentos/shared-types";
import { eq } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";

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
        await db.delete(users).where(eq(users.companyId, company.id));
        await db.delete(companies).where(eq(companies.id, company.id));
      }
    }
    await app.close();
  });

  it("создаёт уведомление и отмечает его прочитанным; повторная отметка — 409", async () => {
    const companyName = `E2E Notifications ${Date.now()}`;
    createdCompanyNames.push(companyName);

    const companyResponse = await request(httpServer).post("/v1/companies").send({ name: companyName }).expect(201);
    const company = companyResponse.body as CompanyResponseDto;

    const userResponse = await request(httpServer)
      .post("/v1/users")
      .send({
        companyId: company.id,
        email: `owner-${Date.now()}@example.com`,
        password: "supersecret123",
        fullName: "Владелец",
      })
      .expect(201);
    const user = userResponse.body as UserResponseDto;

    const notificationResponse = await request(httpServer)
      .post("/v1/notifications")
      .send({ companyId: company.id, userId: user.id, type: "low_stock", payloadJson: { productVariantId: "sku-1" } })
      .expect(201);
    const notification = notificationResponse.body as NotificationResponseDto;
    expect(notification.readAt).toBeNull();

    const readResponse = await request(httpServer)
      .post(`/v1/notifications/${notification.id}/read`)
      .send({ companyId: company.id })
      .expect(201);
    const read = readResponse.body as NotificationResponseDto;
    expect(read.readAt).not.toBeNull();

    const conflictResponse = await request(httpServer)
      .post(`/v1/notifications/${notification.id}/read`)
      .send({ companyId: company.id })
      .expect(409);
    expect((conflictResponse.body as ErrorResponseBody).code).toBe("NOTIFICATION_ALREADY_READ");
  });

  it("POST /v1/notifications с пустым type — 400", async () => {
    const companyName = `E2E Notifications Invalid ${Date.now()}`;
    createdCompanyNames.push(companyName);

    const companyResponse = await request(httpServer).post("/v1/companies").send({ name: companyName }).expect(201);
    const company = companyResponse.body as CompanyResponseDto;

    const userResponse = await request(httpServer)
      .post("/v1/users")
      .send({
        companyId: company.id,
        email: `owner-invalid-${Date.now()}@example.com`,
        password: "supersecret123",
        fullName: "Владелец",
      })
      .expect(201);
    const user = userResponse.body as UserResponseDto;

    await request(httpServer)
      .post("/v1/notifications")
      .send({ companyId: company.id, userId: user.id, type: "" })
      .expect(400);
  });
});
