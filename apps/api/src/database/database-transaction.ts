import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { Database, DbOrTx } from "@garmentos/db-schema";

// Общая транзакция для синхронной композиции модулей (ADR 0001). Контекст
// принадлежит асинхронной операции, поэтому singleton-репозитории не делят
// транзакцию между одновременными HTTP-запросами. Вне run работают как прежде.
export class DatabaseTransaction {
  private readonly context = new AsyncLocalStorage<DbOrTx>();
  readonly database: Database;

  constructor(private readonly connection: Database) {
    this.database = new Proxy(connection, {
      get: (_target, property) => {
        const current = this.context.getStore() ?? this.connection;
        const value: unknown = Reflect.get(current, property, current);
        if (typeof value !== "function") return value;
        return (...args: unknown[]): unknown => Reflect.apply(value, current, args);
      },
    });
  }

  async run<T>(
    companyId: string,
    entityType: string,
    entityId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const execute = async (tx: DbOrTx): Promise<T> => {
      // Повторный клик ждёт завершения первой операции и затем видит её
      // актуальный статус. Блокировка живёт до commit/rollback в Postgres,
      // работает и между несколькими экземплярами API, включает companyId.
      const key = `${companyId}:${entityType}:${entityId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
      return work();
    };
    const active = this.context.getStore();
    if (active) return execute(active);
    return this.connection.transaction((tx) => this.context.run(tx, () => execute(tx)));
  }
}
