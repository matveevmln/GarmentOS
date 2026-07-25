import { randomBytes, randomUUID, createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

// Payload access-токена (docs/AUTH_ARCHITECTURE.md, раздел 1). `roles` —
// исключительно информационно (клиент может показать «вы вошли как
// Директор» без лишнего запроса) — авторизация ВСЕГДА проверяется через
// PermissionsGuard (свежий запрос к БД), никогда через это поле.
export interface AccessTokenPayload {
  sub: string;
  companyId: string;
  roles: string[];
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  signAccessToken(payload: AccessTokenPayload): string {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("JWT_ACCESS_SECRET is not set");
    return this.jwtService.sign(payload, { secret, expiresIn: ACCESS_TOKEN_TTL });
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error("JWT_ACCESS_SECRET is not set");
    return this.jwtService.verify<AccessTokenPayload>(token, { secret });
  }

  // Refresh-токен — непрозрачная случайная строка (docs/AUTH_ARCHITECTURE.md,
  // раздел 1: "непрозрачный, долгоживущий"), не JWT: 256 бит энтропии из
  // crypto.randomBytes уже достаточны против перебора, подписывать нечего —
  // хранится (по хэшу) и проверяется исключительно в Postgres.
  generateRefreshTokenValue(): string {
    return randomBytes(32).toString("hex");
  }

  hashRefreshTokenValue(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }

  generateFamilyId(): string {
    return randomUUID();
  }

  refreshTokenExpiresAt(): Date {
    return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  }
}
