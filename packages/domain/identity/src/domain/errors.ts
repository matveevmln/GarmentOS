// Базовая ошибка домена: use case ловит её и решает, как показать пользователю
// (в отличие от неожиданных исключений инфраструктуры — падений БД и т.п.).
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
