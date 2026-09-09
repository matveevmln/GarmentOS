import { config } from "dotenv";

config({ path: "../../.env" });

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { auditLog, companies, createDb, refreshTokens, roles, userRoles, users } from "@garmentos/db-schema";
import type { AuthResponseDto } from "@garmentos/shared-types";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module";
import { hashPassword } from "../identity/password-hasher";

// E2e для HTTP-слоя /v1/auth/* (Step 4A — обнаруженный пробел: login уже
// косвенно покрыт через setupAuthenticatedCompany во всех остальных e2e-
// наборах, но refresh/logout ни разу не вызывались через реальный HTTP-
// контроллер). Тот же паттерн, что и identity.e2e.spec.ts: реальный Postgres,
// реальный Nest HTTP-стек, явная очистка после каждого теста.
//
// /auth/login ограничен ThrottlerGuard (5 запросов/60 сек, auth.controller.ts)
// — это осознанное производственное поведение, не баг теста. Чтобы тесты на
// refresh/reuse/logout не конкурировали за этот лимит с другими тестами (все
// запросы этого файла идут с одного IP в рамках одного процесса), для них
// refresh-токен создаётся НАПРЯМУЮ в БД (тот же sha256-хэш, что и
// TokenService.hashRefreshTokenValue), а не через реальный /auth/login —
// сам login отдельно проверяется только в первых двух тестах.
interface ErrorResponseBody {
  statusCode: number;
  code?: string;
  message: string;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

function hashRefreshTokenValue(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

async function seedRefreshToken(userId: string): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashRefreshTokenValue(rawToken),
    familyId: randomUUID(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return rawToken;
}

// Не через setupAuthenticatedCompany (auth-test-helper.ts) намеренно: тот
// сам логинится через /v1/auth/login, а тестам этого файла на
// refresh/reuse/logout не нужен ни живой access-токен, ни ещё один расход
// лимита ThrottlerGuard — им нужен только существующий userId/companyId.
async function createCompanyWithOwner(companyName: string): Promise<{ userId: string; companyId: string }> {
  const [company] = await db.insert(companies).values({ name: companyName }).returning();
  if (!company) throw new Error("Не удалось создать тестовую компанию");

  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const [user] = await db
    .insert(users)
    .values({ companyId: company.id, email, passwordHash: hashPassword("test-password-123"), fullName: "Test Owner" })
    .returning();
  if (!user) throw new Error("Не удалось создать тестового пользователя");

  const [ownerRole] = await db
    .select()
    .from(roles)
    .where(and(isNull(roles.companyId), eq(roles.code, "owner")))
    .limit(1);
  if (!ownerRole) throw new Error('Предустановленная роль "owner" не найдена — проверьте миграцию 0007');
  await db.insert(userRoles).values({ userId: user.id, roleId: ownerRole.id });

  return { userId: user.id, companyId: company.id };
}

describe("Auth API (e2e)", () => {
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

  it("login выдаёт access+refresh токены нужной формы", async () => {
    const companyName = `E2E Auth Login ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");
    const email = `e2e-login-${Date.now()}@example.com`;
    const password = "test-password-123";
    await db.insert(users).values({ companyId: company.id, email, passwordHash: hashPassword(password), fullName: "Login Test" });

    const response = await request(httpServer).post("/v1/auth/login").send({ email, password }).expect(200);
    const body = response.body as AuthResponseDto;
    expect(typeof body.accessToken).toBe("string");
    expect(body.accessToken.length).toBeGreaterThan(0);
    expect(typeof body.refreshToken).toBe("string");
    expect(body.refreshToken.length).toBeGreaterThan(0);
    expect(body.user.email).toBe(email);
    expect(body.user.companyId).toBe(company.id);
  });

  it("неверный пароль и несуществующий email дают одинаковый 401 без раскрытия, какая часть неверна", async () => {
    const companyName = `E2E Auth Enum ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const [company] = await db.insert(companies).values({ name: companyName }).returning();
    if (!company) throw new Error("Не удалось создать тестовую компанию");
    const email = `e2e-enum-${Date.now()}@example.com`;
    await db.insert(users).values({ companyId: company.id, email, passwordHash: hashPassword("real-password-123"), fullName: "Enum Test" });

    const wrongPasswordResponse = await request(httpServer)
      .post("/v1/auth/login")
      .send({ email, password: "definitely-wrong-password" })
      .expect(401);
    const nonExistentEmailResponse = await request(httpServer)
      .post("/v1/auth/login")
      .send({ email: "no-such-user-e2e@example.com", password: "anything123" })
      .expect(401);

    const wrongPasswordBody = wrongPasswordResponse.body as ErrorResponseBody;
    const nonExistentEmailBody = nonExistentEmailResponse.body as ErrorResponseBody;
    expect(wrongPasswordBody.code).toBe("INVALID_CREDENTIALS");
    expect(nonExistentEmailBody.code).toBe("INVALID_CREDENTIALS");
    expect(wrongPasswordBody.message).toBe(nonExistentEmailBody.message);
  });

  it("refresh выдаёт новую пару и делает предыдущий refresh-токен недействительным", async () => {
    const companyName = `E2E Auth Rotate ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { userId } = await createCompanyWithOwner(companyName);
    const firstRefreshToken = await seedRefreshToken(userId);

    const refreshResponse = await request(httpServer)
      .post("/v1/auth/refresh")
      .send({ refreshToken: firstRefreshToken })
      .expect(200);
    const secondRefreshToken = (refreshResponse.body as AuthResponseDto).refreshToken;
    expect(secondRefreshToken).not.toBe(firstRefreshToken);
    expect(typeof (refreshResponse.body as AuthResponseDto).accessToken).toBe("string");

    // Старый (уже провёрнутый) refresh-токен больше не должен приниматься.
    const reuseAttempt = await request(httpServer).post("/v1/auth/refresh").send({ refreshToken: firstRefreshToken });
    expect(reuseAttempt.status).toBe(401);
  });

  it("повторное использование уже отработанного refresh-токена отзывает всю семью (reuse detection)", async () => {
    const companyName = `E2E Auth Reuse ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { userId } = await createCompanyWithOwner(companyName);
    const firstRefreshToken = await seedRefreshToken(userId);

    const rotateResponse = await request(httpServer)
      .post("/v1/auth/refresh")
      .send({ refreshToken: firstRefreshToken })
      .expect(200);
    const secondRefreshToken = (rotateResponse.body as AuthResponseDto).refreshToken;

    // Повторно предъявляем УЖЕ отработанный первый токен — сигнал кражи.
    const reuseResponse = await request(httpServer)
      .post("/v1/auth/refresh")
      .send({ refreshToken: firstRefreshToken });
    expect(reuseResponse.status).toBe(401);
    const reuseBody = reuseResponse.body as ErrorResponseBody;
    expect(reuseBody.code).toBe("REFRESH_TOKEN_REUSE_DETECTED");

    // Вся семья отозвана — даже второй (актуальный на момент атаки) токен
    // тоже больше не должен работать, иначе reuse detection бесполезен.
    const secondTokenAfterReuse = await request(httpServer)
      .post("/v1/auth/refresh")
      .send({ refreshToken: secondRefreshToken });
    expect(secondTokenAfterReuse.status).toBe(401);
  });

  it("logout отзывает refresh-токен/семью, после logout refresh больше не работает", async () => {
    const companyName = `E2E Auth Logout ${Date.now()}`;
    createdCompanyNames.push(companyName);
    const { userId } = await createCompanyWithOwner(companyName);
    const refreshToken = await seedRefreshToken(userId);

    await request(httpServer).post("/v1/auth/logout").send({ refreshToken }).expect(200);

    const refreshAfterLogout = await request(httpServer).post("/v1/auth/refresh").send({ refreshToken });
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("некорректный/несуществующий refresh-токен отклоняется 401, не 500", async () => {
    const malformedResponse = await request(httpServer)
      .post("/v1/auth/refresh")
      .send({ refreshToken: "this-is-not-a-real-token-at-all" });
    expect(malformedResponse.status).toBe(401);
    const malformedBody = malformedResponse.body as ErrorResponseBody;
    expect(malformedBody.code).toBe("REFRESH_TOKEN_NOT_FOUND");

    // Пустая строка отклоняется валидацией DTO (refreshSchema: min(1)), а не
    // доменной логикой — тоже не должна давать 500.
    const emptyResponse = await request(httpServer).post("/v1/auth/refresh").send({ refreshToken: "" });
    expect(emptyResponse.status).toBe(400);
  });
});
