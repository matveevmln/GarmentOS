import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { describe, expect, it } from "vitest";
import { createCompany } from "./application/create-company";
import { createUser } from "./application/create-user";
import { DomainError } from "./domain/errors";
import { DrizzleCompanyRepository, DrizzleUserRepository } from "./infrastructure/drizzle-identity-repository";

// Интеграционный тест на реальном Postgres (см. установившуюся в проекте
// практику — packages/db-schema): каждый тест выполняется в отдельной
// транзакции, которая всегда откатывается в конце, поэтому тестовые данные
// никогда не остаются в БД. Откат делается через собственный sentinel-класс
// (а не drizzle-orm tx.rollback()) — postgres.js откатывает транзакцию при
// любой ошибке, брошенной из колбэка .begin(), независимо от её типа; свой
// класс избавляет от хрупкого instanceof поперёк экземпляров модуля.
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

describe("domain/identity", () => {
  it("создаёт компанию с нормализованным названием", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const company = await createCompany({ companies }, { name: "  ООО Ромашка  " });

      expect(company.name).toBe("ООО Ромашка");
      expect(company.timezone).toBe("UTC");
      expect(company.defaultCurrency).toBe("RUB");
    });
  });

  it("отклоняет пустое название компании", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      await expect(createCompany({ companies }, { name: "   " })).rejects.toThrow(DomainError);
    });
  });

  it("создаёт пользователя с email, приведённым к нижнему регистру, и запрещает дубликат в той же компании", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);

      const company = await createCompany({ companies }, { name: "ИП Иванов" });
      const user = await createUser(
        { users: usersRepo },
        {
          companyId: company.id,
          email: "Owner@Example.COM",
          passwordHash: "argon2-hash-placeholder",
          fullName: "Иван Иванов",
        },
      );

      expect(user.email).toBe("owner@example.com");
      expect(user.isActive).toBe(true);

      await expect(
        createUser(
          { users: usersRepo },
          {
            companyId: company.id,
            email: "owner@example.com",
            passwordHash: "другой-хеш",
            fullName: "Другой Иван",
          },
        ),
      ).rejects.toThrow(/уже существует/);
    });
  });

  it("отклоняет некорректный email", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const usersRepo = new DrizzleUserRepository(tx);
      const company = await createCompany({ companies }, { name: "ИП Петров" });

      await expect(
        createUser(
          { users: usersRepo },
          { companyId: company.id, email: "не-email", passwordHash: "hash", fullName: "Пётр Петров" },
        ),
      ).rejects.toThrow(DomainError);
    });
  });
});
