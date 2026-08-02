import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, createUser, DrizzleCompanyRepository, DrizzleUserRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { recordAuditEntry } from "./application/record-audit-entry";
import { DomainError } from "./domain/errors";
import { DrizzleAuditLogRepository } from "./infrastructure/drizzle-audit-log-repository";

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

describe("domain/audit", () => {
  it("записывает действие пользователя через HTTP API с before/after", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд аудита" });
      const user = await createUser(
        { users: new DrizzleUserRepository(tx) },
        { companyId: company.id, email: "owner@example.com", passwordHash: "hash", fullName: "Иван Иванов" },
      );

      const auditLog = new DrizzleAuditLogRepository(tx);
      const entry = await recordAuditEntry(
        { auditLog },
        {
          companyId: company.id,
          userId: user.id,
          source: "http_api",
          entityType: "stock_item",
          entityId: "11111111-1111-1111-1111-111111111111",
          action: "stock.dispatch",
          beforeJson: { quantityOnHand: "100.000" },
          afterJson: { quantityOnHand: "80.000" },
        },
      );

      expect(entry.source).toBe("http_api");
      expect(entry.userId).toBe(user.id);
      expect(entry.inboxSuggestionId).toBeNull();
      expect(entry.beforeJson).toEqual({ quantityOnHand: "100.000" });
      expect(entry.afterJson).toEqual({ quantityOnHand: "80.000" });
    });
  });

  it("записывает действие без инициатора-человека (CLI-бутстрап) — userId допустимо null", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд аудита CLI" });

      const auditLog = new DrizzleAuditLogRepository(tx);
      const entry = await recordAuditEntry(
        { auditLog },
        {
          companyId: company.id,
          userId: null,
          source: "cli",
          entityType: "company",
          entityId: company.id,
          action: "identity.bootstrap_company",
          afterJson: { name: company.name },
        },
      );

      expect(entry.source).toBe("cli");
      expect(entry.userId).toBeNull();
    });
  });

  it("отклоняет пустое действие и пустой тип сущности", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд аудита 3" });
      const auditLog = new DrizzleAuditLogRepository(tx);

      await expect(
        recordAuditEntry(
          { auditLog },
          { companyId: company.id, userId: null, source: "http_api", entityType: "stock_item", entityId: "x", action: "   " },
        ),
      ).rejects.toThrow(DomainError);

      await expect(
        recordAuditEntry(
          { auditLog },
          { companyId: company.id, userId: null, source: "http_api", entityType: "  ", entityId: "x", action: "stock.dispatch" },
        ),
      ).rejects.toThrow(DomainError);
    });
  });
});
