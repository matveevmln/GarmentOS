// Публичный интерфейс модуля Identity & Access (docs/REPOSITORY_STRUCTURE.md).
// Другие модули и apps/api импортируют только отсюда — не из ./domain или
// ./infrastructure напрямую (обеспечено ESLint-правилом no-restricted-imports).

export type { Company } from "./domain/company";
export type { User } from "./domain/user";
export { DomainError } from "./domain/errors";

export type { CompanyRepository, NewCompanyInput, NewUserInput, UserRepository } from "./application/ports";
export { createCompany, type CreateCompanyDeps, type CreateCompanyInput } from "./application/create-company";
export { createUser, type CreateUserDeps, type CreateUserInput } from "./application/create-user";

export { DrizzleCompanyRepository, DrizzleUserRepository } from "./infrastructure/drizzle-identity-repository";
