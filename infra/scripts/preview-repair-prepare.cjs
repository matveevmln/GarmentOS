// Одноразовая подготовка проверки ремонта только в отдельном preview-проекте.
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
if (process.env.RAILWAY_PROJECT_ID !== "0d09f346-1f9b-4c98-bc7c-976164f2fa05") {
  throw new Error("Подготовка тестовой компании разрешена только в garmentos-preview-09");
}
for (const key of ["REPAIR_QA_BOOTSTRAP_KEY", "REPAIR_QA_COMPANY_NAME", "REPAIR_QA_OWNER_EMAIL", "REPAIR_QA_OWNER_PASSWORD"]) {
  if (!process.env[key]) throw new Error(`Отсутствует ${key}`);
}
execFileSync("pnpm", ["--filter", "@garmentos/db-schema", "db:migrate"], { stdio: "inherit" });
execFileSync(process.execPath, [resolve(__dirname, "../../apps/api/dist/bootstrap-company.script.js"),
  "--bootstrap-key", process.env.REPAIR_QA_BOOTSTRAP_KEY,
  "--name", process.env.REPAIR_QA_COMPANY_NAME,
  "--owner-email", process.env.REPAIR_QA_OWNER_EMAIL,
  "--owner-full-name", "Проверка ремонта",
  "--owner-password", process.env.REPAIR_QA_OWNER_PASSWORD,
], { stdio: "inherit" });
execFileSync(process.execPath, [resolve(__dirname, "data-integrity-audit.cjs")], { stdio: "inherit" });
