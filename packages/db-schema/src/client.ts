import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Один клиент на процесс — переиспользуется apps/api и воркерами.
// DATABASE_URL — стандартный протокол Postgres, работает с любой площадкой
// из docs/INFRASTRUCTURE.md без изменений в коде (cloud-agnostic).
export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createDb>;
