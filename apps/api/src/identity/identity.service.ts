import { Inject, Injectable } from "@nestjs/common";
import {
  createCompany,
  createUser,
  type Company,
  type CompanyRepository,
  type User,
  type UserRepository,
} from "@garmentos/domain-identity";
import type { CreateCompanyDto, CreateUserDto } from "@garmentos/shared-types";
import { COMPANY_REPOSITORY, USER_REPOSITORY } from "./identity.tokens";
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
  ) {}

  async createCompany(input: CreateCompanyDto): Promise<Company> {
    return createCompany({ companies: this.companies }, input);
  }

  async createUser(input: CreateUserDto): Promise<User> {
    const passwordHash = hashPassword(input.password);
    return createUser(
      { users: this.users },
      { companyId: input.companyId, email: input.email, passwordHash, fullName: input.fullName },
    );
  }
}
