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
export async function authenticateUser(deps: AuthenticateUserDeps, input: AuthenticateUserInput): Promise<User> {
  const email = input.email.trim().toLowerCase();

  const user = await deps.users.findByEmailGlobal(email);
  if (!user || !user.isActive) {
    throw new DomainError("Неверный email или пароль", "INVALID_CREDENTIALS");
  }

  const passwordValid = deps.passwordVerifier.verify(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new DomainError("Неверный email или пароль", "INVALID_CREDENTIALS");
  }

  return user;
}
