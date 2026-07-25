import { DomainError } from "../domain/errors";
import type { RoleRepository, UserRepository, UserRoleRepository } from "./ports";

export interface ManageUserRoleInput {
  companyId: string;
  userId: string;
  roleCode: string;
}

export interface ManageUserRoleDeps {
  users: UserRepository;
  roles: RoleRepository;
  userRoles: UserRoleRepository;
}

// Роль ищется сначала как кастомная для этой компании, затем как глобальная
// предустановленная (docs/AUTH_ARCHITECTURE.md, раздел 4) — компания может
// переопределить предустановленную роль своей с тем же кодом.
async function resolveRole(deps: ManageUserRoleDeps, companyId: string, roleCode: string) {
  const custom = await deps.roles.findByCode(companyId, roleCode);
  if (custom) return custom;

  const preset = await deps.roles.findByCode(null, roleCode);
  if (preset) return preset;

  throw new DomainError(`Роль "${roleCode}" не найдена`, "ROLE_NOT_FOUND");
}

async function assertUserInCompany(deps: ManageUserRoleDeps, companyId: string, userId: string): Promise<void> {
  const user = await deps.users.findById(companyId, userId);
  if (!user) {
    throw new DomainError(`Пользователь ${userId} не найден в этой компании`, "USER_NOT_FOUND");
  }
}

export async function assignRoleToUser(deps: ManageUserRoleDeps, input: ManageUserRoleInput): Promise<void> {
  await assertUserInCompany(deps, input.companyId, input.userId);
  const role = await resolveRole(deps, input.companyId, input.roleCode);

  await deps.userRoles.assign(input.userId, role.id);
}

export async function revokeRoleFromUser(deps: ManageUserRoleDeps, input: ManageUserRoleInput): Promise<void> {
  await assertUserInCompany(deps, input.companyId, input.userId);
  const role = await resolveRole(deps, input.companyId, input.roleCode);

  await deps.userRoles.revoke(input.userId, role.id);
}

export interface ListUserPermissionsInput {
  userId: string;
}

export interface ListUserPermissionsDeps {
  userRoles: UserRoleRepository;
}

// Источник истины для PermissionsGuard (apps/api). Кэширование результата
// (Redis, TTL) — задокументированная, но осознанно отложенная оптимизация
// (docs/AUTH_ARCHITECTURE.md, раздел 14, п.3): на пилотном масштабе прямой
// запрос к БД на каждый вызов быстрее и проще, чем разворачивать отдельную
// инвалидацию кэша без доказанной необходимости (принцип 3, эволюционная
// архитектура) — добавляется, когда появится измеренная нагрузка.
export async function listUserPermissions(deps: ListUserPermissionsDeps, input: ListUserPermissionsInput): Promise<string[]> {
  return deps.userRoles.listPermissionCodesForUser(input.userId);
}

export async function listUserRoleCodes(deps: ListUserPermissionsDeps, input: ListUserPermissionsInput): Promise<string[]> {
  return deps.userRoles.listRoleCodesForUser(input.userId);
}
