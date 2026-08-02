import { DomainError } from "./errors";

// Refresh-токен (docs/AUTH_ARCHITECTURE.md, раздел 2) — хранится по хэшу
// (tokenHash), не по самому токену: домен и репозиторий никогда не видят
// исходный секрет, только его SHA-256-хэш, вычисленный на уровне apps/api
// (Infrastructure/Auth, тот же принцип, что и с passwordHash в user.ts —
// домен не знает алгоритм хеширования, только оперирует готовым хэшем).
// familyId объединяет всю цепочку токенов одной сессии логина — нужен для
// reuse detection при ротации (см. rotate-refresh-token.ts).
export interface RefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export function assertNotExpired(token: RefreshToken): void {
  if (token.expiresAt.getTime() <= Date.now()) {
    throw new DomainError("Refresh-токен истёк, требуется повторный вход", "REFRESH_TOKEN_EXPIRED");
  }
}
