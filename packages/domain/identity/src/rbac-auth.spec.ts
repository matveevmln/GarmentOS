import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { authenticateUser } from "./application/authenticate-user";
import { createCompany } from "./application/create-company";
import { createUser } from "./application/create-user";
import { assignRoleToUser, listUserPermissions } from "./application/manage-user-roles";
import type { PasswordVerifierPort } from "./application/ports";
import {
  issueRefreshToken,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from "./application/refresh-token-lifecycle";
import { DomainError } from "./domain/errors";
import { DrizzleCompanyRepository, DrizzleUserRepository } from "./infrastructure/drizzle-identity-repository";
import {
  DrizzleRefreshTokenRepository,
  DrizzleRoleRepository,
  DrizzleUserRoleRepository,
} from "./infrastructure/drizzle-rbac-repository";

class RollbackTestTransaction extends Error {}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
}
const db = createDb(databaseUrl);

async function runInRolledBackTransaction(fn: (tx: DbOrTx) => Promise<void>): Promise<void> {
  await db
    .transaction(async (tx) => {
      await fn(tx);
      throw new RollbackTestTransaction();
    })
    .catch((error: unknown) => {
      if (!(error instanceof RollbackTestTransaction)) throw error;
    });
}

// Тестовый двойник PasswordVerifierPort — домен не знает алгоритм хеширования
// (см. application/ports.ts), реальный scrypt-верификатор живёт в apps/api.
const plainTextVerifier: PasswordVerifierPort = {
  verify: (password, passwordHash) => password === passwordHash,
};

describe("domain/identity — RBAC/Auth (Итерация 5)", () => {
  it("authenticateUser: успешный вход, неверный пароль, несуществующий email — одна и та же ошибка", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);
      const company = await createCompany({ companies }, { name: "ООО АутентТест" });
      const email = `owner-${randomUUID()}@example.com`;
      await createUser(
        { users: usersRepo },
        { companyId: company.id, email, passwordHash: "correct-password", fullName: "Владелец" },
      );

      const authenticated = await authenticateUser(
        { users: usersRepo, passwordVerifier: plainTextVerifier },
        { email, password: "correct-password" },
      );
      expect(authenticated.email).toBe(email);

      await expect(
        authenticateUser(
          { users: usersRepo, passwordVerifier: plainTextVerifier },
          { email, password: "wrong-password" },
        ),
      ).rejects.toThrow(/Неверный email или пароль/);

      await expect(
        authenticateUser(
          { users: usersRepo, passwordVerifier: plainTextVerifier },
          { email: `nonexistent-${randomUUID()}@example.com`, password: "anything" },
        ),
      ).rejects.toThrow(/Неверный email или пароль/);
    });
  });

  it("назначает предустановленную глобальную роль пользователю и агрегирует её permissions", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);
      const rolesRepo = new DrizzleRoleRepository(tx);
      const userRolesRepo = new DrizzleUserRoleRepository(tx);

      const company = await createCompany({ companies }, { name: "ООО РолиТест" });
      const user = await createUser(
        { users: usersRepo },
        { companyId: company.id, email: `viewer-${randomUUID()}@example.com`, passwordHash: "x", fullName: "Наблюдатель" },
      );

      await assignRoleToUser(
        { users: usersRepo, roles: rolesRepo, userRoles: userRolesRepo },
        { companyId: company.id, userId: user.id, roleCode: "viewer" },
      );

      const permissionCodes = await listUserPermissions({ userRoles: userRolesRepo }, { userId: user.id });
      expect(permissionCodes).toContain("catalog.read");
      expect(permissionCodes).toContain("finance.read");
      expect(permissionCodes).not.toContain("finance.write");
      expect(permissionCodes).not.toContain("identity.write");
    });
  });

  it("отклоняет назначение несуществующей роли и роли несуществующему пользователю", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);
      const rolesRepo = new DrizzleRoleRepository(tx);
      const userRolesRepo = new DrizzleUserRoleRepository(tx);
      const company = await createCompany({ companies }, { name: "ООО РолиОшибкиТест" });
      const user = await createUser(
        { users: usersRepo },
        { companyId: company.id, email: `user-${randomUUID()}@example.com`, passwordHash: "x", fullName: "Тест" },
      );

      await expect(
        assignRoleToUser(
          { users: usersRepo, roles: rolesRepo, userRoles: userRolesRepo },
          { companyId: company.id, userId: user.id, roleCode: "несуществующая_роль" },
        ),
      ).rejects.toThrow(DomainError);

      await expect(
        assignRoleToUser(
          { users: usersRepo, roles: rolesRepo, userRoles: userRolesRepo },
          { companyId: company.id, userId: "00000000-0000-0000-0000-000000000000", roleCode: "viewer" },
        ),
      ).rejects.toThrow(/не найден/);
    });
  });

  it("refresh-токен: выпуск → ротация → reuse detection отзывает всю семью", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);
      const refreshTokensRepo = new DrizzleRefreshTokenRepository(tx);

      const company = await createCompany({ companies }, { name: "ООО ТокенТест" });
      const user = await createUser(
        { users: usersRepo },
        { companyId: company.id, email: `token-${randomUUID()}@example.com`, passwordHash: "x", fullName: "Тест" },
      );

      const familyId = randomUUID();
      const first = await issueRefreshToken(
        { refreshTokens: refreshTokensRepo },
        { userId: user.id, tokenHash: `hash-1-${randomUUID()}`, familyId, expiresAt: new Date(Date.now() + 3600_000) },
      );
      expect(first.revokedAt).toBeNull();

      const second = await rotateRefreshToken(
        { refreshTokens: refreshTokensRepo },
        {
          presentedTokenHash: first.tokenHash,
          next: { userId: user.id, tokenHash: `hash-2-${randomUUID()}`, familyId, expiresAt: new Date(Date.now() + 3600_000) },
        },
      );
      expect(second.familyId).toBe(familyId);

      // Повторное предъявление уже использованного (revoked) первого токена —
      // сигнал кражи, вся семья отзывается.
      await expect(
        rotateRefreshToken(
          { refreshTokens: refreshTokensRepo },
          {
            presentedTokenHash: first.tokenHash,
            next: { userId: user.id, tokenHash: `hash-3-${randomUUID()}`, familyId, expiresAt: new Date(Date.now() + 3600_000) },
          },
        ),
      ).rejects.toThrow(/повторное использование/);

      // Даже второй (легитимно выданный, ещё не использованный) токен той же
      // семьи теперь отозван вместе с ней.
      await expect(
        rotateRefreshToken(
          { refreshTokens: refreshTokensRepo },
          {
            presentedTokenHash: second.tokenHash,
            next: { userId: user.id, tokenHash: `hash-4-${randomUUID()}`, familyId, expiresAt: new Date(Date.now() + 3600_000) },
          },
        ),
      ).rejects.toThrow(DomainError);
    });
  });

  it("logout отзывает всю семью refresh-токенов", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);
      const refreshTokensRepo = new DrizzleRefreshTokenRepository(tx);
      const company = await createCompany({ companies }, { name: "ООО LogoutТест" });
      const user = await createUser(
        { users: usersRepo },
        { companyId: company.id, email: `logout-${randomUUID()}@example.com`, passwordHash: "x", fullName: "Тест" },
      );

      const familyId = randomUUID();
      const token = await issueRefreshToken(
        { refreshTokens: refreshTokensRepo },
        { userId: user.id, tokenHash: `hash-${randomUUID()}`, familyId, expiresAt: new Date(Date.now() + 3600_000) },
      );

      await revokeRefreshTokenFamily({ refreshTokens: refreshTokensRepo }, { tokenHash: token.tokenHash });

      await expect(
        rotateRefreshToken(
          { refreshTokens: refreshTokensRepo },
          {
            presentedTokenHash: token.tokenHash,
            next: { userId: user.id, tokenHash: `hash-after-logout-${randomUUID()}`, familyId, expiresAt: new Date(Date.now() + 3600_000) },
          },
        ),
      ).rejects.toThrow(/повторное использование/);
    });
  });
});
