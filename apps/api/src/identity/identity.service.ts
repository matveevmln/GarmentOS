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
import type { CreateCompanyDto, CreateUserDto } from "@garmentos/shared-types";
import { COMPANY_REPOSITORY, ROLE_REPOSITORY, USER_REPOSITORY, USER_ROLE_REPOSITORY } from "./identity.tokens";
import { hashPassword } from "./password-hasher";

// Тонкий presentation-адаптер поверх packages/domain/identity — сам не
// содержит бизнес-логики (docs/ARCHITECTURE.md, раздел 2). Репозитории
// внедряются через DI по токенам доменных портов (identity.tokens.ts) —
// сервис не знает, что это Drizzle, use case из домена вызываются как
// обычные функции.
@Injectable()
export class IdentityService {
  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly companies: CompanyRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(USER_ROLE_REPOSITORY) private readonly userRoles: UserRoleRepository,
  ) {}

  // Используется только bootstrap-company.script.ts (docs/AUTH_ARCHITECTURE.md,
  // раздел 9) — нет HTTP-эндпоинта, создающего компанию.
  async createCompany(input: CreateCompanyDto): Promise<Company> {
    return createCompany({ companies: this.companies }, input);
  }

  // companyId — явный параметр, не часть input: вызывается либо из
  // UsersController (companyId из @CurrentUser()), либо из bootstrap-скрипта
  // (companyId только что созданной компании) — в обоих случаях вызывающий
  // код уже знает companyId из контекста, а не из тела запроса клиента.
  async createUser(companyId: string, input: CreateUserDto): Promise<User> {
    const passwordHash = hashPassword(input.password);
    return createUser({ users: this.users }, { companyId, email: input.email, passwordHash, fullName: input.fullName });
  }

  async assignRole(companyId: string, userId: string, roleCode: string): Promise<void> {
    await assignRoleToUser(
      { users: this.users, roles: this.roles, userRoles: this.userRoles },
      { companyId, userId, roleCode },
    );
  }
}
