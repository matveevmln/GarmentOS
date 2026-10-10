// Старый deploy восстановил seed 0034 вне migrator. Не менять уже применённый
// SQL и не пересоздавать право: записать исходную миграцию только после
// проверки ВСЕХ её постусловий и точной предыдущей записи 0033.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { createRequire } = require("node:module");
const root = resolve(__dirname, "../..");
const folder = resolve(root, "packages/db-schema/drizzle");
const journal = JSON.parse(readFileSync(resolve(folder, "meta/_journal.json"), "utf8"));
const target = journal.entries.find((e) => e.tag === "0034_seed_cancel_permission");
const previous = journal.entries.find((e) => e.tag === "0033_seed_rollback_permission_and_presets");
const hash = (entry) => createHash("sha256").update(readFileSync(resolve(folder, entry.tag + ".sql"))).digest("hex");
// Drizzle хранит hash байтов: исторический Windows deploy использовал CRLF.
// Допускаются только LF/CRLF одного исходного SQL, без trim или изменения текста.
const previousSqlLf = readFileSync(resolve(folder, previous.tag + ".sql"), "utf8").replace(/\r\n/g, "\n");
const previousHashes = new Set([hash(previous), ...[previousSqlLf, previousSqlLf.replace(/\n/g, "\r\n")].map((sql) => createHash("sha256").update(sql).digest("hex"))]);
async function reconcile(tx) {
  const [exists] = await tx.unsafe("select to_regclass('drizzle.__drizzle_migrations') as table_name");
  if (!exists.table_name) return { reconciled: false, reason: "fresh_database" };
  await tx.unsafe("lock table drizzle.__drizzle_migrations in exclusive mode");
  const [last] = await tx.unsafe("select hash, created_at from drizzle.__drizzle_migrations order by created_at desc limit 1");
  if (last && Number(last.created_at) >= target.when) return { reconciled: false, reason: "already_recorded" };
  const permissions = await tx.unsafe("select id,module from permissions where code='contract_manufacturing.cancel'");
  if (!permissions.length) return { reconciled: false, reason: "normal_pending_migration" };
  if (!last || Number(last.created_at) !== previous.when || !previousHashes.has(last.hash)) {
    console.error("GARMENTOS_VERIFY " + JSON.stringify({ check: "cancel-seed-migration-history-mismatch", expected: { hashes: [...previousHashes], created_at: previous.when }, actual: last ?? null }));
    throw new Error("История до 0034 не совпадает; автоматическая сверка остановлена");
  }
  const [state] = await tx.unsafe(`select
    (select count(*) from roles where company_id is null and code in ('owner','director')) as roles,
    (select count(*) from roles r cross join permissions p where r.company_id is null and r.code in ('owner','director') and p.code='contract_manufacturing.cancel' and not exists (select 1 from role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id)) as missing_grants`);
  if (permissions.length !== 1 || permissions[0].module !== "contract_manufacturing" || Number(state.roles) !== 2 || Number(state.missing_grants) !== 0) throw new Error("Seed 0034 восстановлен не полностью; автоматическая сверка остановлена");
  await tx.unsafe("insert into drizzle.__drizzle_migrations(hash,created_at) values($1,$2)", [hash(target),target.when]);
  return { reconciled: true, migration: target.tag, previous: previous.tag };
}
module.exports = { reconcile };
if (require.main === module) {
  const postgres = createRequire(resolve(root, "packages/db-schema/package.json"))("postgres");
  const db = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10 });
  db.begin(async (tx) => { await tx.unsafe("set local statement_timeout='15s'"); return reconcile(tx); })
    .then((result) => console.log("GARMENTOS_VERIFY " + JSON.stringify({ check: "cancel-seed-migration-reconciliation", ...result })))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.end({ timeout: 5 }));
}
