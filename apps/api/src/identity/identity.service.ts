import { Inject, Injectable } from "@nestjs/common";
import {
  assignRoleToUser,
  bootstrapCompany,
  createCompany,
  createUser,
  DrizzleCompanyRepository,
  DrizzleRoleRepository,
  DrizzleUserRepository,
  DrizzleUserRoleRepository,
  type BootstrapCompanyResult,
  type Company,
  type CompanyRepository,
  type RoleRepository,
  type User,
  type UserRepository,
  type UserRoleRepository,
} from "@garmentos/domain-identity";
import type { AuditSource } from "@garmentos/domain-audit";
import type { Database } from "@garmentos/db-schema";
import type { CreateCompanyDto, CreateUserDto } from "@garmentos/shared-types";
import { AuditService } from "../audit/audit.service";
import { DATABASE_CONNECTION } from "../database/database.module";
import { COMPANY_REPOSITORY, ROLE_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY } from "./identity.tokens";
import { hashPassword } from "./password-hasher";

export interface BootstrapCompanyCliInput {
  bootstrapKey: string;
  company: CreateCompanyDto;
  ownerEmail: string;
  ownerFullName: string;
  ownerPassword: string;
  ownerRoleCode: string;
}

export interface AuditActor {
  userId: string | null;
  source: AuditSource;
}

// Тонкий presentation-адаптер поверх packages/domain/identity — сам не
// содержит бизнес-логики (docs/ARCHITECTURE.md, раздел 2). Репозитории
// внедряются через DI по токенам доменных портов (identity.tokens.ts) —
// сервис не знает, что это Drizzle, use case из домена вызываются как
// обычные функции.
//
// Аудит (Итерация 6): createUser вызывается и из HTTP (UsersController,
// actor.source="http_api") и из CLI-бутстрапа (actor.source="cli", actor.userId
// всегда null — на этом шаге ещё нет ни одного пользователя компании,
// который мог бы быть инициатором). Оба пути пишут в один и тот же audit_log
// (docs/AUTH_ARCHITECTURE.md, раздел 13 — единый журнал независимо от источника).
@Injectable()
export class IdentityService {
  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly companies: CompanyRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(USER_ROLE_REPOSITORY) private readonly userRoles: UserRoleRepository,
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    private readonly auditService: AuditService,
  ) {}

  // Используется только bootstrap-company.script.ts (docs/AUTH_ARCHITECTURE.md,
  // раздел 9) — нет HTTP-эндпоинта, создающего компанию.
  async createCompany(input: CreateCompanyDto): Promise<Company> {
    const company = await createCompany({ companies: this.companies }, input);
    await this.auditService.record(company.id, null, "cli", {
      entityType: "company",
      entityId: company.id,
      action: "identity.bootstrap_company",
      afterJson: { name: company.name },
    });
    return company;
  }

  // Единственный безопасный для повторного/параллельного запуска способ
  // создать initial-компанию (bootstrap-company.script.ts) — см. аудит
  // идемпотентности bootstrap перед первой реальной production-компанией.
  // Company+Owner+role создаются в ОДНОЙ транзакции поверх tx-репозиториев
  // (тот же DbOrTx-паттерн, что уже используется в DrizzleBomRepository.create
  // и DrizzleRefreshTokenRepository.rotate) — либо всё, либо ничего; DB-level
  // защита от гонки — partial unique index на companies.bootstrap_key внутри
  // domain-use-case, не check-then-act на этом уровне. Обычный createCompany()
  // выше этим не затронут и остаётся отдельным путём для будущего
  // multi-company onboarding.
  async bootstrapCompany(input: BootstrapCompanyCliInput): Promise<BootstrapCompanyResult> {
    const ownerPasswordHash = hashPassword(input.ownerPassword);

    const result = await this.db.transaction(async (tx) => {
      return bootstrapCompany(
        {
          companies: new DrizzleCompanyRepository(tx),
          users: new DrizzleUserRepository(tx),
          roles: new DrizzleRoleRepository(tx),
          userRoles: new DrizzleUserRoleRepository(tx),
        },
        {
          bootstrapKey: input.bootstrapKey,
          company: input.company,
          ownerEmail: input.ownerEmail,
          ownerFullName: input.ownerFullName,
          ownerPasswordHash,
          ownerRoleCode: input.ownerRoleCode,
        },
      );
    });

    // Аудит пишется только когда транзакция реально что-то изменила
    // ("created"/"resumed") — "already_initialized" и "owner_mismatch" не
    // меняют ни одной строки, писать для них запись аудита об изменении было
    // бы недостоверно. Пароль в audit-запись никогда не попадает — только
    // email и имя компании, как и в обычном createUser() ниже.
    if (result.outcome === "created" || result.outcome === "resumed") {
      await this.auditService.record(result.company.id, null, "cli", {
        entityType: "company",
        entityId: result.company.id,
        action: "identity.bootstrap_company",
        afterJson: { name: result.company.name, outcome: result.outcome, ownerEmail: result.owner.email },
      });
    }

    return result;
  }

  // companyId — явный параметр, не часть input: вызывается либо из
  // UsersController (companyId из @CurrentUser()), либо из bootstrap-скрипта
  // (companyId только что созданной компании) — в обоих случаях вызывающий
  // код уже знает companyId из контекста, а не из тела запроса клиента.
  async createUser(companyId: string, input: CreateUserDto, actor: AuditActor): Promise<User> {
    const passwordHash = hashPassword(input.password);
    const user = await createUser({ users: this.users }, { companyId, email: input.email, passwordHash, fullName: input.fullName });
    await this.auditService.record(companyId, actor.userId, actor.source, {
      entityType: "user",
      entityId: user.id,
      action: "identity.create_user",
      afterJson: { email: user.email, fullName: user.fullName },
    });
    return user;
  }

  async assignRole(companyId: string, userId: string, roleCode: string, actor: AuditActor): Promise<void> {
    await assignRoleToUser(
      { users: this.users, roles: this.roles, userRoles: this.userRoles },
      { companyId, userId, roleCode },
    );
    await this.auditService.record(companyId, actor.userId, actor.source, {
      entityType: "user",
      entityId: userId,
      action: "identity.assign_role",
      afterJson: { roleCode },
    });
  }

  async findCompanyById(id: string): Promise<Company | null> {
    return this.companies.findById(id);
  }
}
