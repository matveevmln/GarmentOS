import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.spec.ts"],
    // ARCHITECTURE_REVIEW.md, находка 2.3 (P0) — подмена DATABASE_URL на
    // выделенную тестовую БД до того, как её прочитает любой spec-файл.
    setupFiles: ["./vitest.setup.ts"],
  },
});
