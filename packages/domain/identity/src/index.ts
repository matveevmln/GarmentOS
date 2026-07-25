// Публичный интерфейс модуля Identity & Access (docs/REPOSITORY_STRUCTURE.md).
// Другие модули и apps/api импортируют только отсюда — не из ./domain или
// ./infrastructure напрямую (обеспечено ESLint-правилом no-restricted-imports).

export type { Company } from "./domain/company";
export type { User } from "./domain/user";
export type { Role } from "./domain/role";
export type { Permission } from "./domain/permission";
export type { RefreshToken } from "./domain/refresh-token";
export { DomainError } from "./domain/errors";

export type {
  CompanyRepository,
  NewCompanyInput,
  NewRefreshTokenInput,
  NewUserInput,
  PasswordVerifierPort,
  PermissionRepository,
  RefreshTokenRepository,
  RoleRepository,
  UserRepository,
  UserRoleRepository,
} from "./application/ports";
export { createCompany, type CreateCompanyDeps, type CreateCompanyInput } from "./application/create-company";
export { createUser, type CreateUserDeps, type CreateUserInput } from "./application/create-user";
export { authenticateUser, type AuthenticateUserDeps, type AuthenticateUserInput } from "./application/authenticate-user";
export {
  issueRefreshToken,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
  type IssueRefreshTokenInput,
  type RefreshTokenDeps,
  type RevokeRefreshTokenFamilyInput,
  type RotateRefreshTokenInput,
} from "./application/refresh-token-lifecycle";
export {
  assignRoleToUser,
  listUserPermissions,
  revokeRoleFromUser,
  type ListUserPermissionsDeps,
  type ListUserPermissionsInput,
  type ManageUserRoleDeps,
  type ManageUserRoleInput,
} from "./application/manage-user-roles";

export { DrizzleCompanyRepository, DrizzleUserRepository } from "./infrastructure/drizzle-identity-repository";
export {
  DrizzlePermissionRepository,
  DrizzleRefreshTokenRepository,
  DrizzleRoleRepository,
  DrizzleUserRoleRepository,
} from "./infrastructure/drizzle-rbac-repository";
