import { z } from "zod";

// Контракты модуля Identity & Access (docs/ARCHITECTURE.md, раздел 3).
// API-first (PRINCIPLES.md, принцип 1): эти схемы — источник истины для
// валидации запроса, генерации OpenAPI и (позже) для apps/web — не
// дублируются отдельными DTO-классами в apps/api.

export const createCompanySchema = z.object({
  name: z.string().min(1, "Название компании не может быть пустым"),
  legalName: z.string().optional(),
  inn: z.string().optional(),
  timezone: z.string().optional(),
  defaultCurrency: z.string().optional(),
});
export type CreateCompanyDto = z.infer<typeof createCompanySchema>;

export const companyResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  legalName: z.string().nullable(),
  inn: z.string().nullable(),
  timezone: z.string(),
  defaultCurrency: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CompanyResponseDto = z.infer<typeof companyResponseSchema>;

// `password` — открытый пароль от клиента; API-слой хеширует его
// (Infrastructure/Auth) до вызова доменного createUser, который принимает
// уже готовый passwordHash и не знает об алгоритме (docs/PRINCIPLES.md,
// принцип 4; packages/domain/identity/src/domain/user.ts).
export const createUserSchema = z.object({
  companyId: z.string().uuid(),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Пароль должен быть не короче 8 символов"),
  fullName: z.string().min(1, "Имя пользователя не может быть пустым"),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type UserResponseDto = z.infer<typeof userResponseSchema>;
