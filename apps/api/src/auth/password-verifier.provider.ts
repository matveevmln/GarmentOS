import type { Provider } from "@nestjs/common";
import type { PasswordVerifierPort } from "@garmentos/domain-identity";
import { verifyPassword } from "../identity/password-hasher";
import { PASSWORD_VERIFIER } from "./auth.tokens";

// Адаптер доменного порта PasswordVerifierPort поверх уже реализованного
// scrypt-верификатора (docs/AUTH_ARCHITECTURE.md, раздел 3) — домен не знает
// про scrypt, только про этот интерфейс.
export const passwordVerifierProvider: Provider = {
  provide: PASSWORD_VERIFIER,
  useValue: { verify: verifyPassword } satisfies PasswordVerifierPort,
};
