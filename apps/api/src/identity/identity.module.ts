import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  DrizzleCompanyRepository,
  DrizzlePermissionRepository,
  DrizzleRoleRepository,
  DrizzleUserRepository,
  DrizzleUserRoleRepository,
} from "@garmentos/domain-identity";
import { DATABASE_CONNECTION } from "../database/database.module";
import { UsersController } from "./users.controller";
import {
  COMPANY_REPOSITORY,
  PERMISSION_REPOSITORY,
  ROLE_REPOSITORY,
  USER_REPOSITORY,
  USER_ROLE_REPOSITORY,
} from "./identity.tokens";
import { IdentityService } from "./identity.service";

// Единственное место, знающее про конкретный Drizzle-класс — регистрирует
// его в DI-контейнере под токеном доменного порта. IdentityService зависит
// только от интерфейса (CompanyRepository/UserRepository), не от Drizzle.
// USER_REPOSITORY/USER_ROLE_REPOSITORY экспортируются — их использует
// apps/api/src/auth (AuthModule импортирует этот модуль, а не дублирует
// репозитории заново, docs/AUTH_ARCHITECTURE.md).
@Module({
  controllers: [UsersController],
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
    {
      provide: ROLE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleRoleRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: USER_ROLE_REPOSITORY,
      useFactory: (db: Database) => new DrizzleUserRoleRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: PERMISSION_REPOSITORY,
      useFactory: (db: Database) => new DrizzlePermissionRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
  // IdentityService нужен ai-production-assistant (реквизиты компании для
  // шапки спецификации, Итерация 7) — переиспользуется.
  exports: [USER_REPOSITORY, USER_ROLE_REPOSITORY, ROLE_REPOSITORY, PERMISSION_REPOSITORY, COMPANY_REPOSITORY, IdentityService],
})
export class IdentityModule {}
