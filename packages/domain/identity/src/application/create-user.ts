import { DomainError } from "../domain/errors";
import { assertValidEmail, assertValidFullName, assertValidPasswordHash, type User } from "../domain/user";
import type { UserRepository } from "./ports";

export interface CreateUserInput {
  companyId: string;
  email: string;
  passwordHash: string;
  fullName: string;
}

export interface CreateUserDeps {
  users: UserRepository;
}

export async function createUser(deps: CreateUserDeps, input: CreateUserInput): Promise<User> {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  assertValidEmail(email);
  assertValidFullName(fullName);
  assertValidPasswordHash(input.passwordHash);

  const existing = await deps.users.findByEmail(input.companyId, email);
  if (existing) {
    throw new DomainError(
      `Пользователь с email "${email}" уже существует в этой компании`,
      "USER_EMAIL_TAKEN",
    );
  }

  return deps.users.create({
    companyId: input.companyId,
    email,
    passwordHash: input.passwordHash,
    fullName,
  });
}
