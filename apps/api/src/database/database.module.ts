import { Global, Module } from "@nestjs/common";
import { createDb, type Database } from "@garmentos/db-schema";
import { DatabaseTransaction } from "./database-transaction";

// Единственное место в apps/api, где создаётся подключение к Postgres — все
// доменные модули получают его через DI по токену DATABASE_CONNECTION, а не
// создают свои подключения (docs/ARCHITECTURE.md, раздел 2: Infrastructure-
// слой один на всё приложение).
export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

@Global()
@Module({
  providers: [
    {
      provide: DatabaseTransaction,
      useFactory: (): DatabaseTransaction => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
          throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
        }
        return new DatabaseTransaction(createDb(databaseUrl));
      },
    },
    {
      provide: DATABASE_CONNECTION,
      useFactory: (transaction: DatabaseTransaction): Database => transaction.database,
      inject: [DatabaseTransaction],
    },
  ],
  exports: [DATABASE_CONNECTION, DatabaseTransaction],
})
export class DatabaseModule {}
