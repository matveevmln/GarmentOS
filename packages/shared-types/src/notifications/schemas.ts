import { z } from "zod";

// Контракты модуля Notifications (docs/DATABASE_SCHEMA.md, раздел 16).

export const createNotificationSchema = z.object({
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string().min(1, "Тип уведомления не может быть пустым"),
  payloadJson: z.unknown().optional(),
});
export type CreateNotificationDto = z.infer<typeof createNotificationSchema>;

export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  userId: z.string().uuid(),
  type: z.string(),
  payloadJson: z.unknown().nullable(),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type NotificationResponseDto = z.infer<typeof notificationResponseSchema>;

export const markNotificationReadSchema = z.object({
  companyId: z.string().uuid(),
});
export type MarkNotificationReadDto = z.infer<typeof markNotificationReadSchema>;
