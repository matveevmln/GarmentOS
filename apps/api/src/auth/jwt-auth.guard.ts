import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { toRequestUser } from "./current-user.decorator";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { TokenService } from "./token.service";

interface RequestWithAuth {
  headers: Record<string, string | string[] | undefined>;
  user?: ReturnType<typeof toRequestUser>;
}

// Глобальный guard (зарегистрирован в auth.module.ts через APP_GUARD) —
// требует валидный access-токен на КАЖДОМ эндпоинте, если явно не помечен
// @Public() (docs/AUTH_ARCHITECTURE.md, раздел 8: fail-closed по умолчанию).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const authHeader = request.headers.authorization;
    const token = typeof authHeader === "string" ? authHeader.replace(/^Bearer\s+/i, "") : undefined;
    if (!token || token === authHeader) {
      throw new UnauthorizedException("Отсутствует access-токен (заголовок Authorization: Bearer <token>)");
    }

    try {
      const payload = this.tokenService.verifyAccessToken(token);
      request.user = toRequestUser(payload);
      return true;
    } catch {
      throw new UnauthorizedException("Access-токен недействителен или истёк");
    }
  }
}
