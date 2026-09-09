import { companies, users, type DbOrTx } from "@garmentos/db-schema";
import { and, eq, isNotNull } from "drizzle-orm";
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
    signerName: row.signerName,
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

  async findById(id: string): Promise<Company | null> {
    const [row] = await this.db.select().from(companies).where(eq(companies.id, id)).limit(1);
    return row ? toCompany(row) : null;
  }

  // ON CONFLICT DO NOTHING — единственный способ закрыть race condition на
  // уровне БД, а не приложения: два одновременных вызова с одним и тем же
  // bootstrapKey всегда сериализуются Postgres на уровне partial unique
  // index (companies_bootstrap_key_idx); ровно один получает строку через
  // RETURNING, второй получает null и должен пойти по resume-пути
  // (bootstrap-company.ts), а не молча создавать вторую компанию.
  async createIfAbsentByBootstrapKey(bootstrapKey: string, input: NewCompanyInput): Promise<Company | null> {
    const [row] = await this.db
      .insert(companies)
      .values({ ...input, bootstrapKey })
      .onConflictDoNothing({ target: companies.bootstrapKey, where: isNotNull(companies.bootstrapKey) })
      .returning();
    return row ? toCompany(row) : null;
  }

  async findByBootstrapKey(bootstrapKey: string): Promise<Company | null> {
    const [row] = await this.db.select().from(companies).where(eq(companies.bootstrapKey, bootstrapKey)).limit(1);
    return row ? toCompany(row) : null;
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

  // limit(2), а не limit(1) и не выборка целиком: вызывающему коду нужно
  // отличить только три случая — ни одного, ровно один, больше одного
  // (authenticate-user.ts). Второй строки достаточно, чтобы обнаружить
  // коллизию email между компаниями, а Postgres останавливает чтение раньше.
  async findByEmailGlobal(email: string): Promise<User[]> {
    const rows = await this.db.select().from(users).where(eq(users.email, email)).limit(2);
    return rows.map(toUser);
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
