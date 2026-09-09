import { DomainError } from "../domain/errors";
import type { User } from "../domain/user";
import type { PasswordVerifierPort, UserRepository } from "./ports";

export interface AuthenticateUserInput {
  email: string;
  password: string;
}

export interface AuthenticateUserDeps {
  users: UserRepository;
  passwordVerifier: PasswordVerifierPort;
}

// Единая ошибка на "email не найден" и "пароль неверный" — не сообщаем
// злоумышленнику, какая часть пары неверна (стандартная защита от
// перечисления email-адресов через ответ формы логина).
//
// Коллизия email между компаниями (email уникален только внутри компании —
// users_company_email_idx на (company_id, email)): если один и тот же адрес
// заведён в двух компаниях, определить тенант по одному лишь email
// невозможно. Выбрать первого попавшегося нельзя — это молча пустило бы
// человека в чужую компанию, поэтому логин отклоняется. Ошибка при этом
// намеренно НЕ отличается от обычной "неверный email или пароль": иначе
// сам факт отказа сообщал бы постороннему, что этот адрес заведён более чем
// в одной компании. Диагностируется на стороне оператора запросом к БД
// (SELECT company_id FROM users WHERE email = ...), не через ответ API.
export async function authenticateUser(deps: AuthenticateUserDeps, input: AuthenticateUserInput): Promise<User> {
  const email = input.email.trim().toLowerCase();

  const candidates = await deps.users.findByEmailGlobal(email);
  if (candidates.length !== 1) {
    // 0 — пользователя нет; больше одного — тенант неоднозначен.
    throw new DomainError("Неверный email или пароль", "INVALID_CREDENTIALS");
  }

  const user = candidates[0];
  if (!user.isActive) {
    throw new DomainError("Неверный email или пароль", "INVALID_CREDENTIALS");
  }

  const passwordValid = deps.passwordVerifier.verify(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new DomainError("Неверный email или пароль", "INVALID_CREDENTIALS");
  }

  return user;
}
