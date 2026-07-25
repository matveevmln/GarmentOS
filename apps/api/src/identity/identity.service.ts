import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  createCompany,
  createUser,
  DrizzleCompanyRepository,
  DrizzleUserRepository,
  type Company,
  type User,
} from "@garmentos/domain-identity";
import type { CreateCompanyDto, CreateUserDto } from "@garmentos/shared-types";
import { DATABASE_CONNECTION } from "../database/database.module";
import { hashPassword } from "./password-hasher";

// Тонкий presentation-адаптер поверх packages/domain/identity — сам не
// содержит бизнес-логики (docs/ARCHITECTURE.md, раздел 2). Репозитории
// создаются здесь (единственное место, знающее про Drizzle в этом модуле),
// use case из домена вызываются как обычные функции.
@Injectable()
export class IdentityService {
  private readonly companies: DrizzleCompanyRepository;
  private readonly users: DrizzleUserRepository;

  constructor(@Inject(DATABASE_CONNECTION) db: Database) {
    this.companies = new DrizzleCompanyRepository(db);
    this.users = new DrizzleUserRepository(db);
  }

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
