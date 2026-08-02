import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { telegramInviteCodes, type Database } from "@garmentos/db-schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { DATABASE_CONNECTION } from "../database/database.module";

export type TelegramInviteTargetType = "company" | "workshop";

export interface TelegramInviteCode {
  id: string;
  code: string;
  companyId: string;
  targetType: TelegramInviteTargetType;
  targetId: string;
  expiresAt: Date;
  usedAt: Date | null;
}

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 часа — инвайт-код одноразовый и недолговечный

// Транспортный слой (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 1) —
// не доменный порт, простой Drizzle-репозиторий прямо в apps/api, тот же
// подход, что bootstrap-company.script.ts для операций без сложных
// бизнес-инвариантов сверх "код одноразовый и с ограниченным сроком".
@Injectable()
export class TelegramInviteCodeRepository {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async create(companyId: string, targetType: TelegramInviteTargetType, targetId: string): Promise<TelegramInviteCode> {
    const code = randomBytes(16).toString("base64url");
    const [row] = await this.db
      .insert(telegramInviteCodes)
      .values({ code, companyId, targetType, targetId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) })
      .returning();
    if (!row) throw new Error("INSERT telegram_invite_codes не вернул строку");
    return row;
  }

  async findValidByCode(code: string): Promise<TelegramInviteCode | null> {
    const [row] = await this.db
      .select()
      .from(telegramInviteCodes)
      .where(and(eq(telegramInviteCodes.code, code), isNull(telegramInviteCodes.usedAt), gt(telegramInviteCodes.expiresAt, new Date())))
      .limit(1);
    return row ?? null;
  }

  async markUsed(id: string): Promise<void> {
    await this.db.update(telegramInviteCodes).set({ usedAt: new Date() }).where(eq(telegramInviteCodes.id, id));
  }
}
