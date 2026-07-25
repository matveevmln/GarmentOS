import { config } from "dotenv";

config({ path: "../../../.env" });

import { createDb, type DbOrTx } from "@garmentos/db-schema";
import { createCompany, createUser, DrizzleCompanyRepository, DrizzleUserRepository } from "@garmentos/domain-identity";
import { describe, expect, it } from "vitest";
import { createNotification } from "./application/create-notification";
import { markNotificationRead } from "./application/mark-notification-read";
import { DomainError } from "./domain/errors";
import { DrizzleNotificationRepository } from "./infrastructure/drizzle-notification-repository";

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

describe("domain/notifications", () => {
  it("создаёт уведомление о низком остатке и отмечает его прочитанным", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд уведомлений" });
      const user = await createUser(
        { users: new DrizzleUserRepository(tx) },
        { companyId: company.id, email: "owner@example.com", passwordHash: "hash", fullName: "Иван Иванов" },
      );

      const notifications = new DrizzleNotificationRepository(tx);
      const notification = await createNotification(
        { notifications },
        { companyId: company.id, userId: user.id, type: "low_stock", payloadJson: { materialId: "fabric-1", remaining: 12 } },
      );
      expect(notification.readAt).toBeNull();

      const read = await markNotificationRead({ notifications }, { companyId: company.id, notificationId: notification.id });
      expect(read.readAt).not.toBeNull();

      await expect(
        markNotificationRead({ notifications }, { companyId: company.id, notificationId: notification.id }),
      ).rejects.toThrow(DomainError);
    });
  });

  it("отклоняет пустой тип уведомления", async () => {
    await runInRolledBackTransaction(async (tx) => {
      const company = await createCompany({ companies: new DrizzleCompanyRepository(tx) }, { name: "Бренд уведомлений 2" });
      const user = await createUser(
        { users: new DrizzleUserRepository(tx) },
        { companyId: company.id, email: "owner2@example.com", passwordHash: "hash", fullName: "Пётр Петров" },
      );
      const notifications = new DrizzleNotificationRepository(tx);

      await expect(
        createNotification({ notifications }, { companyId: company.id, userId: user.id, type: "   " }),
      ).rejects.toThrow(DomainError);
    });
  });
});
