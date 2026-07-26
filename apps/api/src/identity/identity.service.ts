import { Inject, Injectable } from "@nestjs/common";
import {
  assignRoleToUser,
  createCompany,
  createUser,
  type Company,
  type CompanyRepository,
  type RoleRepository,
  type User,
  type UserRepository,
  type UserRoleRepository,
} from "@garmentos/domain-identity";
import type { AuditSource } from "@garmentos/domain-audit";
import type { CreateCompanyDto, CreateUserDto } from "@garmentos/shared-types";
import { AuditService } from "../audit/audit.service";
import { COMPANY_REPOSITORY, ROLE_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY } from "./identity.tokens";
import { hashPassword } from "./password-hasher";

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
}
