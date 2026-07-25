import type { Company } from "../domain/company";
import type { Permission } from "../domain/permission";
import type { RefreshToken } from "../domain/refresh-token";
import type { Role } from "../domain/role";
import type { User } from "../domain/user";

export interface NewCompanyInput {
  name: string;
  legalName: string | null;
  inn: string | null;
  timezone: string;
  defaultCurrency: string;
}

export interface CompanyRepository {
  create(input: NewCompanyInput): Promise<Company>;
}

export interface NewUserInput {
  companyId: string;
  email: string;
  passwordHash: string;
  fullName: string;
}

export interface UserRepository {
  create(input: NewUserInput): Promise<User>;
  findByEmail(companyId: string, email: string): Promise<User | null>;
  // Поиск без companyId — единственное место, где это оправдано: на входе в
  // систему (authenticate-user.ts) компания ещё не известна, известен только
  // email — контекст запроса (companyId из JWT) появляется только ПОСЛЕ
  // успешного логина, это и есть то единственное исключение.
  findByEmailGlobal(email: string): Promise<User | null>;
  findById(companyId: string, id: string): Promise<User | null>;
}

// Домен не знает алгоритм хеширования пароля (PRINCIPLES.md, принцип 4) —
// сравнение введённого пароля с сохранённым хэшем делегировано наружу через
// этот порт, реализация — apps/api/src/identity/password-hasher.ts (scrypt).
export interface PasswordVerifierPort {
  verify(password: string, passwordHash: string): boolean;
}

export interface RoleRepository {
  // companyId=null ищет среди глобальных предустановленных ролей.
  findByCode(companyId: string | null, code: string): Promise<Role | null>;
  findById(id: string): Promise<Role | null>;
}

export interface UserRoleRepository {
  assign(userId: string, roleId: string): Promise<void>;
  revoke(userId: string, roleId: string): Promise<void>;
  // Агрегирует permissions всех ролей пользователя одним запросом
  // (user_roles → role_permissions → permissions) — источник истины для
  // PermissionsGuard (короткий Redis-кэш поверх этого метода — apps/api).
  listPermissionCodesForUser(userId: string): Promise<string[]>;
}

export type { Permission };

export interface PermissionRepository {
  findByCode(code: string): Promise<Permission | null>;
}

export interface NewRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenRepository {
  create(input: NewRefreshTokenInput): Promise<RefreshToken>;
  findByHash(tokenHash: string): Promise<RefreshToken | null>;
  // Атомарно: помечает revokedAt+replacedById у текущего, создаёт новый той
  // же family_id — одна транзакция (rotate-refresh-token.ts).
  rotate(currentId: string, next: NewRefreshTokenInput): Promise<RefreshToken>;
  revokeFamily(familyId: string): Promise<void>;
}
