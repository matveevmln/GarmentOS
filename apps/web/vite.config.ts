import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GarmentOS web (Итерация 11, docs/ROADMAP.md) — SPA, без SSR (docs/TECH_STACK.md).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  // @garmentos/shared-types собирается в CommonJS (packages/shared-types,
  // общий с apps/api/NestJS) — без явного включения в pre-bundling Vite dev
  // server пытается импортировать именованные экспорты напрямую из CJS-файла
  // через /@fs/, минуя esbuild CJS→ESM interop, и падает с SyntaxError.
  optimizeDeps: {
    include: ["@garmentos/shared-types"],
  },
});
