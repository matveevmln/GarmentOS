import { ForbiddenException, Inject, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { listUserPermissions, type UserRoleRepository } from "@garmentos/domain-identity";
import { USER_ROLE_REPOSITORY } from "../identity/identity.tokens";
import type { AuthenticatedRequestUser } from "./current-user.decorator";
import { PERMISSIONS_KEY } from "./require-permissions.decorator";
import { IS_PUBLIC_KEY } from "./public.decorator";

interface RequestWithUser {
  user?: AuthenticatedRequestUser;
}

// Глобальный guard (APP_GUARD, после JwtAuthGuard). Проверяет permissions
// пользователя прямым запросом к БД на каждый вызов (docs/AUTH_ARCHITECTURE.md,
// раздел 14, п.3 — без Redis-кэша, осознанно отложенная оптимизация).
// Эндпоинт без @RequirePermissions(...) — доступен любому аутентифицированному
// пользователю без дополнительной проверки (см. комментарий декоратора,
// случай notifications).
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(USER_ROLE_REPOSITORY) private readonly userRoles: UserRoleRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      // JwtAuthGuard всегда выполняется раньше и либо устанавливает req.user,
      // либо бросает 401 — это защитный код на случай перестановки guard'ов.
      throw new ForbiddenException("Пользователь не аутентифицирован");
    }

    const granted = await listUserPermissions({ userRoles: this.userRoles }, { userId: request.user.id });
    const missing = required.filter((permission) => !granted.includes(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(`Недостаточно прав: требуется ${missing.join(", ")}`);
    }

    return true;
  }
}
