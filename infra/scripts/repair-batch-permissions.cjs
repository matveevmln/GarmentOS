// Восстановление только стандартного seed 0033/0034. Без схемы и пользовательских ролей.
const { createRequire } = require("node:module");
const { resolve } = require("node:path");
const postgres = createRequire(resolve(__dirname, "../../packages/db-schema/package.json"))("postgres");

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL отсутствует");
  const db = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  const apply = process.argv.includes("--apply");
  try {
    const result = await db.begin(apply ? "" : "read only", async (tx) => {
      await tx.unsafe("set local statement_timeout = '15s'");
      if (apply) await tx.unsafe("select pg_advisory_xact_lock(hashtextextended('garmentos:standard-batch-permissions', 0))");
      const check = async () => {
        const [row] = await tx.unsafe(`select
          (select count(*) from permissions where code in ('contract_manufacturing.cancel','contract_manufacturing.rollback')) as permissions,
          (select count(*) from roles r cross join permissions p where r.company_id is null and r.code in ('owner','director') and p.code in ('contract_manufacturing.cancel','contract_manufacturing.rollback') and not exists (select 1 from role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id)) as missing_grants,
          (select count(*) from user_roles ur join roles r on r.id=ur.role_id join users u on u.id=ur.user_id where u.is_active and r.company_id is null and r.code='owner' and not exists (select 1 from role_permissions rp join permissions p on p.id=rp.permission_id where rp.role_id=r.id and p.code='contract_manufacturing.cancel')) as owners_without_cancel`);
        return Object.fromEntries(Object.entries(row).map(([k,v]) => [k, Number(v)]));
      };
      const before = await check();
      if (apply) {
        await tx.unsafe(`insert into permissions (code,module) values ('contract_manufacturing.cancel','contract_manufacturing'),('contract_manufacturing.rollback','contract_manufacturing') on conflict (code) do nothing`);
        await tx.unsafe(`insert into role_permissions (role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.company_id is null and r.code in ('owner','director') and p.code in ('contract_manufacturing.cancel','contract_manufacturing.rollback') on conflict do nothing`);
      }
      return { before, after: await check() };
    });
    console.log("standard-batch-permissions " + JSON.stringify({ check: "standard-batch-permissions", apply, checkedAt: new Date().toISOString(), ...result }));
  } catch (error) {
    console.error("standard-batch-permissions " + JSON.stringify({ check: "standard-batch-permissions", failed: true, code: error.code ?? "PERMISSION_REPAIR_FAILED" }));
    process.exitCode = 1;
  } finally { await db.end({ timeout: 5 }); }
}
run().catch(() => { console.error("Ошибка проверки прав"); process.exitCode = 1; });
