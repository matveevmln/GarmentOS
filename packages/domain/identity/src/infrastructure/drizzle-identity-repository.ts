import { companies, users, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { Company } from "../domain/company";
import type { User } from "../domain/user";
import type { CompanyRepository, NewCompanyInput, NewUserInput, UserRepository } from "../application/ports";

type CompanyRow = typeof companies.$inferSelect;
type UserRow = typeof users.$inferSelect;

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legalName,
    inn: row.inn,
    timezone: row.timezone,
    defaultCurrency: row.defaultCurrency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    companyId: row.companyId,
    email: row.email,
    passwordHash: row.passwordHash,
    fullName: row.fullName,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleCompanyRepository implements CompanyRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewCompanyInput): Promise<Company> {
    const [row] = await this.db.insert(companies).values(input).returning();
    if (!row) throw new Error("INSERT companies не вернул строку");
    return toCompany(row);
  }
}

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewUserInput): Promise<User> {
    const [row] = await this.db.insert(users).values(input).returning();
    if (!row) throw new Error("INSERT users не вернул строку");
    return toUser(row);
  }

  async findByEmail(companyId: string, email: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.email, email)))
      .limit(1);
    return row ? toUser(row) : null;
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return row ? toUser(row) : null;
  }

  async findByIdGlobal(id: string): Promise<User | null> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return row ? toUser(row) : null;
  }

  async findById(companyId: string, id: string): Promise<User | null> {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.companyId, companyId), eq(users.id, id)))
      .limit(1);
    return row ? toUser(row) : null;
  }
}
