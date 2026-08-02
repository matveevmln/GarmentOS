import { z } from "zod";

// Контракты аутентификации (docs/AUTH_ARCHITECTURE.md).

export const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Пароль обязателен"),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken обязателен"),
});
export type RefreshDto = z.infer<typeof refreshSchema>;

export const authenticatedUserResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  roles: z.array(z.string()),
});
export type AuthenticatedUserResponseDto = z.infer<typeof authenticatedUserResponseSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: authenticatedUserResponseSchema,
});
export type AuthResponseDto = z.infer<typeof authResponseSchema>;
