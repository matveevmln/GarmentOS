import { config } from "dotenv";

config({ path: "../../../.env" });

import { randomUUID } from "node:crypto";
import { companies as companiesTable, createDb, users as usersTable, userRoles as userRolesTable, type DbOrTx } from "@garmentos/db-schema";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { bootstrapCompany, type BootstrapCompanyDeps, type BootstrapCompanyInput } from "./application/bootstrap-company";
import { createUser } from "./application/create-user";
import { DomainError } from "./domain/errors";
import { DrizzleCompanyRepository, DrizzleUserRepository } from "./infrastructure/drizzle-identity-repository";
import { DrizzleRoleRepository, DrizzleUserRoleRepository } from "./infrastructure/drizzle-rbac-repository";

// Интеграционные тесты на реальном Postgres — тот же принцип, что и
// identity.spec.ts: каждый последовательный тест выполняется в собственной
// откатываемой транзакции. Тест на гонку (сценарий 3) — единственное
// исключение: два по-настоящему параллельных верхнеуровневых db.transaction()
// не могут жить в одной обёртке-откате, поэтому у него собственная явная
// зачистка в конце (см. ниже).
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

function reposFor(tx: DbOrTx): BootstrapCompanyDeps {
  return {
    companies: new DrizzleCompanyRepository(tx),
    users: new DrizzleUserRepository(tx),
    roles: new DrizzleRoleRepository(tx),
    userRoles: new DrizzleUserRoleRepository(tx),
  };
}

function uniqueKey(label: string): string {
  return `test-bootstrap-${label}-${randomUUID()}`;
}

function inputFor(bootstrapKey: string, overrides: Partial<BootstrapCompanyInput> = {}): BootstrapCompanyInput {
  return {
    bootstrapKey,
    company: { name: "ООО Пилот" },
    ownerEmail: "owner@pilot.example",
    ownerFullName: "Иван Владелец",
    ownerPasswordHash: "argon2-hash-placeholder",
    ownerRoleCode: "owner",
    ...overrides,
  };
}

describe("domain/identity — bootstrapCompany", () => {
  it("1. первый запуск создаёт компанию, владельца и роль", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const key = uniqueKey("first-run");
      const result = await bootstrapCompany(reposFor(tx), inputFor(key));

      expect(result.outcome).toBe("created");
      if (result.outcome !== "created") return;
      expect(result.company.name).toBe("ООО Пилот");
      expect(result.owner.email).toBe("owner@pilot.example");

      const userRoles = new DrizzleUserRoleRepository(tx);
      const roleCodes = await userRoles.listRoleCodesForUser(result.owner.id);
      expect(roleCodes).toContain("owner");
    });
  });

  it("2. повторный запуск с тем же bootstrapKey и тем же owner-email не создаёт вторую компанию", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const key = uniqueKey("repeat-run");
      const deps = reposFor(tx);

      const first = await bootstrapCompany(deps, inputFor(key));
      expect(first.outcome).toBe("created");

      const second = await bootstrapCompany(deps, inputFor(key));
      expect(second.outcome).toBe("already_initialized");
      if (first.outcome !== "created" || second.outcome !== "already_initialized") return;
      expect(second.company.id).toBe(first.company.id);
      expect(second.owner.id).toBe(first.owner.id);
    });
  });

  it("4. ошибка при создании владельца откатывает всё целиком (компания не остаётся)", async () => {
    const key = uniqueKey("rollback-owner");

    // Владелец уже существует в компании с другим email, но мы намеренно
    // подсовываем createUser email, который эмулирует сбой — проще и надёжнее
    // спровоцировать сбой через некорректный email (проходит доменную
    // валидацию только у createUser), гарантированно бросающий до создания
    // роли, всё ещё внутри той же попытки "created".
    await expect(
      db.transaction(async (tx) => bootstrapCompany(reposFor(tx), inputFor(key, { ownerEmail: "не-email" }))),
    ).rejects.toThrow(DomainError);

    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const company = await companies.findByBootstrapKey(key);
      expect(company).toBeNull();
    });
  });

  it("5. ошибка при назначении роли откатывает всё целиком (компания и владелец не остаются)", async () => {
    const key = uniqueKey("rollback-role");

    await expect(
      db.transaction(async (tx) => bootstrapCompany(reposFor(tx), inputFor(key, { ownerRoleCode: "no-such-role" }))),
    ).rejects.toThrow(DomainError);

    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const users = new DrizzleUserRepository(tx);
      const company = await companies.findByBootstrapKey(key);
      expect(company).toBeNull();

      const owners = await users.findByEmailGlobal("owner@pilot.example");
      expect(owners).toHaveLength(0);
    });
  });

  it("6. компания существует, владелец отсутствует — безопасно дозаполняется (resume)", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const key = uniqueKey("resume-no-owner");
      const companies = new DrizzleCompanyRepository(tx);

      // Эмулирует прерванный запуск: шаг 1 (создание компании) выполнен,
      // владелец ещё не создан — тем же атомарным методом, который использует
      // сам bootstrapCompany на первом шаге.
      const createdCompany = await companies.createIfAbsentByBootstrapKey(key, {
        name: "ООО Пилот",
        legalName: null,
        inn: null,
        timezone: "UTC",
        defaultCurrency: "KGS",
        signerName: null,
      });
      expect(createdCompany).not.toBeNull();

      const result = await bootstrapCompany(reposFor(tx), inputFor(key));
      expect(result.outcome).toBe("resumed");
      if (result.outcome !== "resumed") return;
      expect(result.company.id).toBe(createdCompany?.id);
      expect(result.owner.email).toBe("owner@pilot.example");
    });
  });

  it("7. компания и владелец существуют, роль отсутствует — безопасно дозаполняется (resume)", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const key = uniqueKey("resume-no-role");
      const companies = new DrizzleCompanyRepository(tx);
      const users = new DrizzleUserRepository(tx);

      const createdCompany = await companies.createIfAbsentByBootstrapKey(key, {
        name: "ООО Пилот",
        legalName: null,
        inn: null,
        timezone: "UTC",
        defaultCurrency: "KGS",
        signerName: null,
      });
      if (!createdCompany) throw new Error("setup failed");

      const existingOwner = await createUser(
        { users },
        {
          companyId: createdCompany.id,
          email: "owner@pilot.example",
          passwordHash: "argon2-hash-placeholder",
          fullName: "Иван Владелец",
        },
      );

      const result = await bootstrapCompany(reposFor(tx), inputFor(key));
      expect(result.outcome).toBe("resumed");
      if (result.outcome !== "resumed") return;
      expect(result.owner.id).toBe(existingOwner.id);

      const userRoles = new DrizzleUserRoleRepository(tx);
      const roleCodes = await userRoles.listRoleCodesForUser(existingOwner.id);
      expect(roleCodes).toContain("owner");
    });
  });

  it("8. компания и владелец существуют с ДРУГИМ email — безопасный отказ без изменений", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const key = uniqueKey("owner-mismatch");
      const deps = reposFor(tx);

      const first = await bootstrapCompany(deps, inputFor(key, { ownerEmail: "real-owner@pilot.example" }));
      expect(first.outcome).toBe("created");
      if (first.outcome !== "created") return;

      const second = await bootstrapCompany(deps, inputFor(key, { ownerEmail: "someone-else@pilot.example" }));
      expect(second.outcome).toBe("owner_mismatch");
      if (second.outcome !== "owner_mismatch") return;
      expect(second.company.id).toBe(first.company.id);
      expect(second.existingOwnerEmail).toBe("real-owner@pilot.example");

      // Ничего не изменилось: второго владельца не появилось, роль осталась
      // только у первого.
      const users = new DrizzleUserRepository(tx);
      const impostor = await users.findByEmail(first.company.id, "someone-else@pilot.example");
      expect(impostor).toBeNull();

      const userRoles = new DrizzleUserRoleRepository(tx);
      const roleCodes = await userRoles.listRoleCodesForUser(first.owner.id);
      expect(roleCodes).toContain("owner");
    });
  });

  it("9. один и тот же bootstrapKey не может породить вторую компанию даже с другим названием", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const key = uniqueKey("same-key-diff-name");
      const deps = reposFor(tx);

      const first = await bootstrapCompany(deps, inputFor(key, { company: { name: "ООО Первое" } }));
      expect(first.outcome).toBe("created");

      const second = await bootstrapCompany(
        deps,
        inputFor(key, { company: { name: "ООО Другое Название" }, ownerEmail: "owner@pilot.example" }),
      );
      // Тот же email → already_initialized, а не вторая компания; имя не
      // меняется на новое — вторая попытка полностью проигнорирована.
      expect(second.outcome).toBe("already_initialized");
      if (first.outcome !== "created" || second.outcome !== "already_initialized") return;
      expect(second.company.id).toBe(first.company.id);
      expect(second.company.name).toBe("ООО Первое");
    });
  });

  it("10. обычное (не-bootstrap) создание нескольких компаний по-прежнему работает", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const companies = new DrizzleCompanyRepository(tx);
      const a = await companies.create({
        name: "Компания A",
        legalName: null,
        inn: null,
        timezone: "UTC",
        defaultCurrency: "KGS",
        signerName: null,
      });
      const b = await companies.create({
        name: "Компания B",
        legalName: null,
        inn: null,
        timezone: "UTC",
        defaultCurrency: "KGS",
        signerName: null,
      });
      const c = await companies.create({
        name: "Компания C",
        legalName: null,
        inn: null,
        timezone: "UTC",
        defaultCurrency: "KGS",
        signerName: null,
      });

      expect(new Set([a.id, b.id, c.id]).size).toBe(3);
    });
  });

  it("11. пароль (хеш) нигде не попадает в текст ошибки при сбое", async () => {
    const key = uniqueKey("password-not-leaked");
    const secretHash = "argon2-super-secret-hash-marker";

    try {
      await db.transaction(async (tx) =>
        bootstrapCompany(reposFor(tx), inputFor(key, { ownerRoleCode: "no-such-role", ownerPasswordHash: secretHash })),
      );
      expect.unreachable("ожидалась ошибка из-за несуществующей роли");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secretHash);
    }
  });

  describe("3. параллельные запуски с одним bootstrapKey", () => {
    const concurrentKey = uniqueKey("concurrent");

    afterAll(async () => {
      // Собственная зачистка: этот тест намеренно работает поверх двух
      // независимых верхнеуровневых транзакций (иначе гонка не проверяется),
      // поэтому не может использовать общую откатываемую обёртку — убираем
      // за собой вручную, чтобы тестовые данные не осели в БД.
      const company = await new DrizzleCompanyRepository(db).findByBootstrapKey(concurrentKey);
      if (!company) return;

      const users = new DrizzleUserRepository(db);
      const owner = await users.findByEmail(company.id, "owner@pilot.example");

      if (owner) {
        await db.delete(userRolesTable).where(eq(userRolesTable.userId, owner.id));
        await db.delete(usersTable).where(eq(usersTable.id, owner.id));
      }
      await db.delete(companiesTable).where(eq(companiesTable.id, company.id));
    });

    it("ровно одна компания, один владелец, одна роль создаются при гонке", async () => {
      const attempt = () => db.transaction(async (tx) => bootstrapCompany(reposFor(tx), inputFor(concurrentKey)));

      const [resultA, resultB] = await Promise.all([attempt(), attempt()]);

      // Ровно один из двух параллельных вызовов реально создаёт (побеждает
      // гонку за partial unique index), второй безопасно резолвится в
      // "already_initialized" тем же владельцем — ни при каких раскладах не
      // "owner_mismatch" и не вторая компания, так как email одинаковый.
      const outcomes = [resultA.outcome, resultB.outcome].sort();
      expect(outcomes).toEqual(["already_initialized", "created"]);

      const createdResult = resultA.outcome === "created" ? resultA : resultB;
      const otherResult = resultA.outcome === "created" ? resultB : resultA;
      if (createdResult.outcome !== "created" || otherResult.outcome !== "already_initialized") {
        throw new Error("неожиданная комбинация исходов гонки");
      }
      expect(otherResult.company.id).toBe(createdResult.company.id);
      expect(otherResult.owner.id).toBe(createdResult.owner.id);

      const companies = new DrizzleCompanyRepository(db);
      const company = await companies.findByBootstrapKey(concurrentKey);
      expect(company).not.toBeNull();

      const users = new DrizzleUserRepository(db);
      const owner = await users.findByEmail(company!.id, "owner@pilot.example");
      expect(owner).not.toBeNull();

      const userRoles = new DrizzleUserRoleRepository(db);
      const roleCodes = await userRoles.listRoleCodesForUser(owner!.id);
      expect(roleCodes.filter((code) => code === "owner")).toHaveLength(1);
    });
  });
});
