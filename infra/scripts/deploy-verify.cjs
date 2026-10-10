// Выполнение из готового API-образа, до переключения трафика.
// Миграции -> стандартные права -> проверка целостности. Нет seed тестовых данных.
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../..");
execFileSync("pnpm", ["--filter", "@garmentos/db-schema", "db:migrate"], {
  cwd: root,
  stdio: "inherit",
  timeout: 180000,
});
for (const [script, args] of [
  ["repair-batch-permissions.cjs", ["--apply"]],
  ["data-integrity-audit.cjs", []],
]) {
  const output = execFileSync(process.execPath, [resolve(__dirname, script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  });
  console.log("GARMENTOS_VERIFY " + output.trim());
}
