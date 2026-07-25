import { SetMetadata } from "@nestjs/common";

// Fail-closed по умолчанию (PRINCIPLES.md, принцип 10 — безопасность по
// умолчанию): JwtAuthGuard требует валидный access-токен на КАЖДОМ
// эндпоинте, если явно не помечено @Public() — а не наоборот (когда забытый
// @UseGuards на новом контроллере тихо оставляет эндпоинт без аутентификации).
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
