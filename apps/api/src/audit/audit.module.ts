import { Global, Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleAuditLogRepository } from "@garmentos/domain-audit";
import { DATABASE_CONNECTION } from "../database/database.module";
import { AuditService } from "./audit.service";
import { AUDIT_LOG_REPOSITORY } from "./audit.tokens";

// @Global() — AuditService нужен почти всем остальным доменным модулям
// (docs/ARCHITECTURE.md, раздел 7), в отличие от них самих, ни разу не
// используется в обратную сторону — обычный per-feature модуль здесь
// потребовал бы импортировать AuditModule в 11 местах без всякой пользы.
@Global()
@Module({
  providers: [
    AuditService,
    {
      provide: AUDIT_LOG_REPOSITORY,
      useFactory: (db: Database) => new DrizzleAuditLogRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
