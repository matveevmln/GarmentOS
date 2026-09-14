import { SetMetadata } from "@nestjs/common";

// Право в формате <module>.<action> (docs/AUTH_ARCHITECTURE.md, раздел 5),
// например @RequirePermissions("catalog.write"). Отсутствие декоратора на
// эндпоинте означает "доступен любому аутентифицированному пользователю без
// дополнительной проверки права" — осознанный случай для notifications
// (доступ определяется владением записью, не ролью, раздел 7), не для
// остальных 10 модулей, где декоратор проставляется всегда.
export const PERMISSIONS_KEY = "requiredPermissions";
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

// OR-семантика — достаточно ЛЮБОГО из перечисленных прав (в отличие от
// RequirePermissions выше, где нужны ВСЕ). Заведено для DocumentsController
// (Этап 2 — «Паспорт модели», 2026-09-12): один и тот же generic-эндпоинт
// /documents обслуживает документы разных доменов (фото модели — catalog.*,
// спецификация — specification.*, накладные партии — contract_manufacturing.*),
// и жёстко привязывать его к одному модулю значило бы либо закрыть каталогу
// доступ к своим же фото, либо ослабить проверку до "любой аутентифицированный".
export const PERMISSIONS_ANY_KEY = "requiredAnyPermissions";
export const RequireAnyPermission = (...permissions: string[]) => SetMetadata(PERMISSIONS_ANY_KEY, permissions);
