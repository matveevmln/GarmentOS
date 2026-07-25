import { Global, Module } from "@nestjs/common";
import { createDb, type Database } from "@garmentos/db-schema";

// Единственное место в apps/api, где создаётся подключение к Postgres — все
// доменные модули получают его через DI по токену DATABASE_CONNECTION, а не
// создают свои подключения (docs/ARCHITECTURE.md, раздел 2: Infrastructure-
// слой один на всё приложение).
export const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): Database => {
        const databaseUrl = process.env.DATABASE_URL;
        if (!databaseUrl) {
          throw new Error("DATABASE_URL is not set — скопируйте .env.example в .env (корень репозитория)");
        }
        return createDb(databaseUrl);
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
