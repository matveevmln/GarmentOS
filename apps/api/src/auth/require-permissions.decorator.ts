import { SetMetadata } from "@nestjs/common";

// Право в формате <module>.<action> (docs/AUTH_ARCHITECTURE.md, раздел 5),
// например @RequirePermissions("catalog.write"). Отсутствие декоратора на
// эндпоинте означает "доступен любому аутентифицированному пользователю без
// дополнительной проверки права" — осознанный случай для notifications
// (доступ определяется владением записью, не ролью, раздел 7), не для
// остальных 10 модулей, где декоратор проставляется всегда.
export const PERMISSIONS_KEY = "requiredPermissions";
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
