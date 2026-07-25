import { boolean, type AnyPgColumn, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { auditColumns, id } from "./_shared";

// docs/DATABASE_SCHEMA.md, раздел 4 (Identity & Access).
// Корень мультитенантности — companies. Ни одна другая таблица в схеме
// не существует без ссылки (прямой или косвенной) на companies.id.

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  inn: text("inn"),
  timezone: text("timezone").notNull().default("UTC"),
  defaultCurrency: text("default_currency").notNull().default("RUB"),
  ...auditColumns,
});

export const users = pgTable(
  "users",
  {
    id: id(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns,
  },
  (table) => [uniqueIndex("users_company_email_idx").on(table.companyId, table.email)],
);

export const roles = pgTable(
  "roles",
  {
    id: id(),
    // NULL = глобальная предустановленная роль, иначе — кастомная роль компании
    // (docs/DATABASE_SCHEMA.md, раздел 4).
    companyId: uuid("company_id").references(() => companies.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    ...auditColumns,
  },
  (table) => [uniqueIndex("roles_company_code_idx").on(table.companyId, table.code)],
);

export const permissions = pgTable(
  "permissions",
  {
    id: id(),
    code: text("code").notNull().unique(),
    module: text("module").notNull(),
    ...auditColumns,
  },
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [uniqueIndex("role_permissions_pk_idx").on(table.roleId, table.permissionId)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
  },
  (table) => [uniqueIndex("user_roles_pk_idx").on(table.userId, table.roleId)],
);

// Refresh-токены (docs/AUTH_ARCHITECTURE.md, раздел 2) — источник истины в
// Postgres, не в Redis (Local-First, PRINCIPLES.md принцип 14): отзыв должен
// быть надёжным даже после потери кэша. Сам токен не хранится — только его
// хэш (tokenHash), чтобы утечка БД не давала возможность использовать
// токены напрямую. familyId объединяет всю цепочку токенов одной сессии
// логина — при обнаружении повторного использования уже отработанного
// токена (revokedAt IS NOT NULL) отзывается вся семья разом (reuse
// detection, защита от кражи refresh-токена).
export const refreshTokens = pgTable("refresh_tokens", {
  id: id(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  familyId: uuid("family_id").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedById: uuid("replaced_by_id").references((): AnyPgColumn => refreshTokens.id),
});
