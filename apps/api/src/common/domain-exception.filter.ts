import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";

// Не импортируем тип Response из "express" намеренно — избегаем добавления
// @types/express только ради одной сигнатуры (boring/минимальные зависимости).
interface MinimalHttpResponse {
  status(code: number): { json(body: unknown): void };
}

// Каждый доменный модуль (packages/domain/*) бросает свой собственный класс
// DomainError (не общий базовый класс — модули независимы, docs/ARCHITECTURE.md
// «Правило межмодульного взаимодействия»), но все они одинаковой формы:
// message + code. Фильтр опознаёт их по форме (duck typing), не по импорту
// конкретного класса — иначе apps/api пришлось бы зависеть от всех 11 пакетов
// только ради error-handling.
interface DomainErrorLike extends Error {
  code: string;
}

function isDomainErrorLike(error: unknown): error is DomainErrorLike {
  return error instanceof Error && typeof (error as { code?: unknown }).code === "string";
}

// Ошибки Auth (packages/domain/identity) — исключение из общего маппинга по
// суффиксу: конвенционально всегда 401, а не 404/400 (docs/AUTH_ARCHITECTURE.md).
// Явный список, а не суффикс, — сознательно, чтобы не задеть другие
// *_NOT_FOUND коды (например, USER_NOT_FOUND при назначении роли — это
// обычный 404, не сбой аутентификации).
const UNAUTHORIZED_CODES = new Set([
  "INVALID_CREDENTIALS",
  "REFRESH_TOKEN_NOT_FOUND",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_REUSE_DETECTED",
]);

// Единообразный маппинг кода ошибки на HTTP-статус по суффиксу — так же, как
// коды ошибок уже единообразны по конвенции внутри каждого домена
// (*_NOT_FOUND, *_TAKEN, *_INVALID и т.п., см. packages/domain/*/src/domain/errors.ts).
function statusForCode(code: string): number {
  if (UNAUTHORIZED_CODES.has(code)) return HttpStatus.UNAUTHORIZED;
  if (code.endsWith("_NOT_FOUND")) return HttpStatus.NOT_FOUND;
  if (
    code.endsWith("_TAKEN") ||
    code.includes("_ALREADY_") ||
    code.endsWith("_NOT_DRAFT") ||
    code.endsWith("_NOT_APPROVED") ||
    code.endsWith("_NOT_PLANNED") ||
    code.endsWith("_NOT_IN_PROGRESS") ||
    code.endsWith("_NOT_READY_FOR_PICKUP") ||
    code.endsWith("_INVALID_STATUS_TRANSITION")
  ) {
    return HttpStatus.CONFLICT;
  }
  return HttpStatus.BAD_REQUEST;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<MinimalHttpResponse>();

    if (isDomainErrorLike(error)) {
      const status = statusForCode(error.code);
      response.status(status).json({ statusCode: status, code: error.code, message: error.message });
      return;
    }

    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }

    this.logger.error(error);
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: "Internal server error" });
  }
}
