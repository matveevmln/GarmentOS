import { createRequire } from "node:module";
import { resolve } from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

type Tx = postgres.TransactionSql;
const { reconcile } = createRequire(__filename)(
  resolve(__dirname, "../../../infra/scripts/reconcile-cancel-permission-migration.cjs"),
) as { reconcile: (tx: Tx) => Promise<{ reconciled: boolean; reason?: string }> };
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("Проверка миграций разрешена только в _test базе");
const db = postgres(url, { max: 1 });
afterAll(() => db.end({ timeout: 5 }));
const rollback = new Error("fixture rollback");
const isolated = async (check: (tx: Tx) => Promise<void>) => {
  try {
    await db.begin(async (tx) => {
      await check(tx);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
};

describe("Сверка seed 0034 с журналом миграций", () => {
  it("сохраняет ID права и фиксирует только уже выполненную 0034, не следующую схему", async () =>
    isolated(async (tx) => {
      await tx.unsafe("delete from drizzle.__drizzle_migrations where created_at >= 1789732802681");
      const [before] = await tx.unsafe(
        "select id from permissions where code='contract_manufacturing.cancel'",
      );
      expect((await reconcile(tx)).reconciled).toBe(true);
      const [after] = await tx.unsafe(
        "select id from permissions where code='contract_manufacturing.cancel'",
      );
      expect(after.id).toBe(before.id);
      const [last] = await tx.unsafe(
        "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
      );
      expect(Number(last.created_at)).toBe(1789732802681);
      expect((await reconcile(tx)).reconciled).toBe(false);
    }));
  it("не отмечает применённой миграцию с отсутствующим стандартным правом роли", async () =>
    isolated(async (tx) => {
      await tx.unsafe("delete from drizzle.__drizzle_migrations where created_at >= 1789732802681");
      await tx.unsafe(
        "delete from role_permissions where role_id in (select id from roles where company_id is null and code='director') and permission_id in (select id from permissions where code='contract_manufacturing.cancel')",
      );
      await expect(reconcile(tx)).rejects.toThrow("не полностью");
      const [last] = await tx.unsafe(
        "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
      );
      expect(Number(last.created_at)).toBe(1789646402681);
    }));
  it("не пропускает другую или повреждённую историю миграций", async () =>
    isolated(async (tx) => {
      await tx.unsafe("delete from drizzle.__drizzle_migrations where created_at >= 1789732802681");
      await tx.unsafe(
        "update drizzle.__drizzle_migrations set hash='unexpected' where created_at=1789646402681",
      );
      await expect(reconcile(tx)).rejects.toThrow("История до 0034");
    }));
});
