import { defineConfig, devices } from "@playwright/test";

// T01 (docs/tasks/T01.md, ADR 0002) — проход A02/A03/B01 в реальном браузере
// на тестовой БД. apps/api и vite dev-сервер запускаются вручную перед
// прогоном (см. docs/reports/T01.md — точные команды), не через
// `webServer` этого конфига: это упрощает переиспользование уже поднятых
// серверов между несколькими прогонами и явный контроль над тестовой БД.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
