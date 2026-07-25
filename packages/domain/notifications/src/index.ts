// Публичный интерфейс модуля Notifications (docs/REPOSITORY_STRUCTURE.md).

export type { Notification } from "./domain/notification";
export { DomainError } from "./domain/errors";

export type { NewNotificationInput, NotificationRepository } from "./application/ports";
export { createNotification, type CreateNotificationDeps, type CreateNotificationInput } from "./application/create-notification";
export {
  markNotificationRead,
  type MarkNotificationReadDeps,
  type MarkNotificationReadInput,
} from "./application/mark-notification-read";

export { DrizzleNotificationRepository } from "./infrastructure/drizzle-notification-repository";
