import {
  permissions,
  refreshTokens,
  roles,
  userRoles,
  rolePermissions,
  type DbOrTx,
} from "@garmentos/db-schema";
import { and, eq, isNull } from "drizzle-orm";
import type { Permission } from "../domain/permission";
import type { RefreshToken } from "../domain/refresh-token";
import type { Role } from "../domain/role";
import type {
  NewRefreshTokenInput,
  PermissionRepository,
  RefreshTokenRepository,
  RoleRepository,
  UserRoleRepository,
} from "../application/ports";

type RoleRow = typeof roles.$inferSelect;
type PermissionRow = typeof permissions.$inferSelect;
type RefreshTokenRow = typeof refreshTokens.$inferSelect;

function toRole(row: RoleRow): Role {
  return {
    id: row.id,
    companyId: row.companyId,
    code: row.code,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPermission(row: PermissionRow): Permission {
  return { id: row.id, code: row.code, module: row.module, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

function toRefreshToken(row: RefreshTokenRow): RefreshToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    replacedById: row.replacedById,
  };
}

export class DrizzleRoleRepository implements RoleRepository {
  constructor(private readonly db: DbOrTx) {}

  async findByCode(companyId: string | null, code: string): Promise<Role | null> {
    const companyCondition = companyId === null ? isNull(roles.companyId) : eq(roles.companyId, companyId);
    const [row] = await this.db
      .select()
      .from(roles)
      .where(and(companyCondition, eq(roles.code, code)))
      .limit(1);
    return row ? toRole(row) : null;
  }

  async findById(id: string): Promise<Role | null> {
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    return row ? toRole(row) : null;
  }
}

export class DrizzlePermissionRepository implements PermissionRepository {
  constructor(private readonly db: DbOrTx) {}

  async findByCode(code: string): Promise<Permission | null> {
    const [row] = await this.db.select().from(permissions).where(eq(permissions.code, code)).limit(1);
    return row ? toPermission(row) : null;
  }
}

export class DrizzleUserRoleRepository implements UserRoleRepository {
  constructor(private readonly db: DbOrTx) {}

  async assign(userId: string, roleId: string): Promise<void> {
    await this.db.insert(userRoles).values({ userId, roleId }).onConflictDoNothing();
  }

  async revoke(userId: string, roleId: string): Promise<void> {
    await this.db.delete(userRoles).where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));
  }

  async listPermissionCodesForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));

    return [...new Set(rows.map((row) => row.code))];
  }

  async listRoleCodesForUser(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));

    return [...new Set(rows.map((row) => row.code))];
  }
}

export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewRefreshTokenInput): Promise<RefreshToken> {
    const [row] = await this.db.insert(refreshTokens).values(input).returning();
    if (!row) throw new Error("INSERT refresh_tokens не вернул строку");
    return toRefreshToken(row);
  }

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const [row] = await this.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    return row ? toRefreshToken(row) : null;
  }

  // Атомарно в одной транзакции: старый токен помечается использованным
  // (revokedAt+replacedById), новый создаётся той же family_id — либо оба
  // шага применяются, либо ни один (docs/AUTH_ARCHITECTURE.md, раздел 2).
  async rotate(currentId: string, next: NewRefreshTokenInput): Promise<RefreshToken> {
    return this.db.transaction(async (tx) => {
      const [newRow] = await tx.insert(refreshTokens).values(next).returning();
      if (!newRow) throw new Error("INSERT refresh_tokens не вернул строку при ротации");

      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date(), replacedById: newRow.id })
        .where(eq(refreshTokens.id, currentId));

      return toRefreshToken(newRow);
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }
}
