import { DomainError } from "../domain/errors";
import { assertNotAlreadyRead, type Notification } from "../domain/notification";
import type { NotificationRepository } from "./ports";

export interface MarkNotificationReadInput {
  companyId: string;
  userId: string;
  notificationId: string;
}

export interface MarkNotificationReadDeps {
  notifications: NotificationRepository;
}

export async function markNotificationRead(
  deps: MarkNotificationReadDeps,
  input: MarkNotificationReadInput,
): Promise<Notification> {
  const notification = await deps.notifications.findById(input.companyId, input.notificationId);
  // notifications не подчиняется ролевой матрице (docs/AUTH_ARCHITECTURE.md,
  // раздел 7) — доступ определяется владением записью: пользователь видит и
  // отмечает прочитанными только свои уведомления, независимо от роли.
  if (!notification || notification.userId !== input.userId) {
    throw new DomainError(`Уведомление ${input.notificationId} не найдено в этой компании`, "NOTIFICATION_NOT_FOUND");
  }
  assertNotAlreadyRead(notification.readAt);

  return deps.notifications.markRead(notification.id);
}
