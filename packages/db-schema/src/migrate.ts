import { config } from "dotenv";
config({ path: "../../.env" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "./schema";

// Применяет миграции из ./drizzle к БД, указанной в DATABASE_URL.
// Используется в CI/деплое (docs/QUALITY_STANDARDS.md) — не drizzle-kit push,
// которым удобно только для локальной разработки.
// Отдельное (не через createDb/client.ts) подключение с max: 1 — миграции
// не должны делить пул соединений с рантаймом приложения, и соединение
// обязательно закрывается по завершении, иначе процесс не выходит.
async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const migrationClient = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(migrationClient, { schema }), { migrationsFolder: "./drizzle" });
    console.log("Миграции применены успешно.");
  } finally {
    await migrationClient.end();
  }
}

run().catch((error: unknown) => {
  console.error("Ошибка применения миграций:", error);
  process.exitCode = 1;
});
