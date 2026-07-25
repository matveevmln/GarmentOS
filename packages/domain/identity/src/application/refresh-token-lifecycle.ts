import { DomainError } from "../domain/errors";
import { assertNotExpired, type RefreshToken } from "../domain/refresh-token";
import type { NewRefreshTokenInput, RefreshTokenRepository } from "./ports";

export interface IssueRefreshTokenInput {
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
}

export interface RefreshTokenDeps {
  refreshTokens: RefreshTokenRepository;
}

// Выпускает первый токен новой "семьи" (сессии логина) — familyId генерирует
// вызывающий код (apps/api), т.к. это просто новый случайный идентификатор,
// не доменное правило.
export async function issueRefreshToken(deps: RefreshTokenDeps, input: IssueRefreshTokenInput): Promise<RefreshToken> {
  return deps.refreshTokens.create(input);
}

export interface RotateRefreshTokenInput {
  presentedTokenHash: string;
  next: NewRefreshTokenInput;
}

// Ротация refresh-токена (docs/AUTH_ARCHITECTURE.md, раздел 1-2): предъявлен
// текущий токен, выдаётся новый той же "семьи", текущий помечается
// использованным. Reuse detection — ключевой инвариант: если предъявленный
// токен уже был отмечен revoked (то есть кто-то другой уже провёл им ротацию
// раньше) — это сигнал кражи токена, вся семья отзывается разом и требуется
// полный повторный вход.
export async function rotateRefreshToken(deps: RefreshTokenDeps, input: RotateRefreshTokenInput): Promise<RefreshToken> {
  const current = await deps.refreshTokens.findByHash(input.presentedTokenHash);
  if (!current) {
    throw new DomainError("Refresh-токен не найден", "REFRESH_TOKEN_NOT_FOUND");
  }

  if (current.revokedAt !== null) {
    await deps.refreshTokens.revokeFamily(current.familyId);
    throw new DomainError(
      "Обнаружено повторное использование уже отработанного refresh-токена — сессия отозвана целиком",
      "REFRESH_TOKEN_REUSE_DETECTED",
    );
  }

  assertNotExpired(current);

  return deps.refreshTokens.rotate(current.id, input.next);
}

export interface RevokeRefreshTokenFamilyInput {
  tokenHash: string;
}

// Logout — отзывает всю семью токенов текущей сессии (не только предъявленный
// токен), чтобы уже выданные, но ещё не использованные токены той же цепочки
// ротации тоже нельзя было использовать.
export async function revokeRefreshTokenFamily(
  deps: RefreshTokenDeps,
  input: RevokeRefreshTokenFamilyInput,
): Promise<void> {
  const current = await deps.refreshTokens.findByHash(input.tokenHash);
  if (!current) {
    throw new DomainError("Refresh-токен не найден", "REFRESH_TOKEN_NOT_FOUND");
  }

  await deps.refreshTokens.revokeFamily(current.familyId);
}
