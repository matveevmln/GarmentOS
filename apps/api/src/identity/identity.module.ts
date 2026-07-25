import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleCompanyRepository, DrizzleUserRepository } from "@garmentos/domain-identity";
import { DATABASE_CONNECTION } from "../database/database.module";
import { CompaniesController } from "./companies.controller";
import { UsersController } from "./users.controller";
import { COMPANY_REPOSITORY, USER_REPOSITORY } from "./identity.tokens";
import { IdentityService } from "./identity.service";

// Единственное место, знающее про конкретный Drizzle-класс — регистрирует
// его в DI-контейнере под токеном доменного порта. IdentityService зависит
// только от интерфейса (CompanyRepository/UserRepository), не от Drizzle.
@Module({
  controllers: [CompaniesController, UsersController],
  providers: [
    IdentityService,
    {
      provide: COMPANY_REPOSITORY,
      useFactory: (db: Database) => new DrizzleCompanyRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: USER_REPOSITORY,
      useFactory: (db: Database) => new DrizzleUserRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class IdentityModule {}
