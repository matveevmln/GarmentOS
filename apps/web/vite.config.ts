import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// GarmentOS web (Итерация 11, docs/ROADMAP.md) — SPA, без SSR (docs/TECH_STACK.md).
// Tailwind CSS — решено docs/UI_FOUNDATION.md (2026-08-02): инженерный
// фундамент под shadcn/ui-паттерн компонентов, не источник фирменного вида —
// см. src/design-system/tokens.css, где переопределяются токены на наши.
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
