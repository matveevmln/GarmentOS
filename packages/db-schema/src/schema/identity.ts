import { boolean, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
