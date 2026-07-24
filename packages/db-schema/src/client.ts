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

// Тип «БД-клиент или открытая транзакция на нём» — repository-реализации в
// packages/domain/*/infrastructure принимают именно этот тип, а не Database,
// чтобы один и тот же репозиторий работал как со обычным клиентом, так и
// внутри db.transaction(...) (нужно для интеграционных тестов на реальном
// Postgres — вся тестовая транзакция откатывается в конце, и для доменных
// use case'ов, которым нужна атомарность нескольких INSERT/UPDATE).
type TransactionCallback = Parameters<Database["transaction"]>[0];
export type DbOrTx = Database | Parameters<TransactionCallback>[0];
