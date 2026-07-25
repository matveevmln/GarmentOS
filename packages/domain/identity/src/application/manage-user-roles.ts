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

// Источник истины для PermissionsGuard (apps/api кэширует результат в Redis
// на короткий TTL, docs/AUTH_ARCHITECTURE.md, раздел 13, п.3) — не источник
// истины сам по себе, только оптимизация обращения к этой функции.
export async function listUserPermissions(deps: ListUserPermissionsDeps, input: ListUserPermissionsInput): Promise<string[]> {
  return deps.userRoles.listPermissionCodesForUser(input.userId);
}
