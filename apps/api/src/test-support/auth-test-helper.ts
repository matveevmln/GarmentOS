import type { Server } from "node:http";
import { companies, roles, userRoles, users, type Database } from "@garmentos/db-schema";
import type { AuthResponseDto } from "@garmentos/shared-types";
import { and, eq, isNull } from "drizzle-orm";
import request from "supertest";
import { hashPassword } from "../identity/password-hasher";

export interface AuthTestContext {
  companyId: string;
  userId: string;
  accessToken: string;
}

// Общий помощник для e2e-тестов всех 11 модулей (Итерация 5,
// docs/AUTH_ARCHITECTURE.md): создаёт компанию + пользователя напрямую в БД
// (тот же паттерн, что и раньше для company — не через CLI-бутстрап,
// которому нужен отдельный процесс), назначает предустановленную роль и
// логинится через настоящий /v1/auth/login, чтобы получить настоящий JWT —
// сами HTTP-запросы модулей проверяются как обычный аутентифицированный
// клиент, не в обход guard'ов.
export async function setupAuthenticatedCompany(
  db: Database,
  httpServer: Server,
  companyName: string,
  roleCode: string,
): Promise<AuthTestContext> {
  const [company] = await db.insert(companies).values({ name: companyName }).returning();
  if (!company) throw new Error("Не удалось создать тестовую компанию");

  const email = `test-${roleCode}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "test-password-123";
  const [user] = await db
    .insert(users)
    .values({ companyId: company.id, email, passwordHash: hashPassword(password), fullName: "Test User" })
    .returning();
  if (!user) throw new Error("Не удалось создать тестового пользователя");

  const [role] = await db
    .select()
    .from(roles)
    .where(and(isNull(roles.companyId), eq(roles.code, roleCode)))
    .limit(1);
  if (!role) throw new Error(`Предустановленная роль "${roleCode}" не найдена — проверьте миграцию 0007`);
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

  const loginResponse = await request(httpServer).post("/v1/auth/login").send({ email, password }).expect(200);
  const accessToken = (loginResponse.body as AuthResponseDto).accessToken;

  return { companyId: company.id, userId: user.id, accessToken };
}

export function authHeader(accessToken: string): [string, string] {
  return ["Authorization", `Bearer ${accessToken}`];
}

export interface AuthenticatedUser {
  userId: string;
  accessToken: string;
}

// Добавляет второго пользователя в уже существующую (созданную
// setupAuthenticatedCompany) компанию — нужно там, где сценарий проверяет
// принадлежность записи конкретному пользователю в рамках одной компании
// (например, notifications, docs/AUTH_ARCHITECTURE.md, раздел 7).
export async function addUserToCompany(
  db: Database,
  httpServer: Server,
  companyId: string,
  roleCode: string,
): Promise<AuthenticatedUser> {
  const email = `test-${roleCode}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "test-password-123";
  const [user] = await db
    .insert(users)
    .values({ companyId, email, passwordHash: hashPassword(password), fullName: "Test User 2" })
    .returning();
  if (!user) throw new Error("Не удалось создать второго тестового пользователя");

  const [role] = await db
    .select()
    .from(roles)
    .where(and(isNull(roles.companyId), eq(roles.code, roleCode)))
    .limit(1);
  if (!role) throw new Error(`Предустановленная роль "${roleCode}" не найдена — проверьте миграцию 0007`);
  await db.insert(userRoles).values({ userId: user.id, roleId: role.id });

  const loginResponse = await request(httpServer).post("/v1/auth/login").send({ email, password }).expect(200);
  const accessToken = (loginResponse.body as AuthResponseDto).accessToken;

  return { userId: user.id, accessToken };
}
