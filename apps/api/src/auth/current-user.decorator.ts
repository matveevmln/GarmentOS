import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AccessTokenPayload } from "./token.service";

export interface AuthenticatedRequestUser {
  id: string;
  companyId: string;
  roles: string[];
}

export function toRequestUser(payload: AccessTokenPayload): AuthenticatedRequestUser {
  return { id: payload.sub, companyId: payload.companyId, roles: payload.roles };
}

// Извлекает пользователя, установленного JwtAuthGuard (req.user) — companyId
// отсюда, а не из тела запроса (docs/AUTH_ARCHITECTURE.md, раздел 8:
// мультитенантность на уровне авторизации).
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedRequestUser => {
  const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedRequestUser }>();
  return request.user;
});
