import { DomainError } from "../domain/errors";
import { assertNotAlreadyRead, type Notification } from "../domain/notification";
import type { NotificationRepository } from "./ports";

export interface MarkNotificationReadInput {
  companyId: string;
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
  if (!notification) {
    throw new DomainError(`Уведомление ${input.notificationId} не найдено в этой компании`, "NOTIFICATION_NOT_FOUND");
  }
  assertNotAlreadyRead(notification.readAt);

  return deps.notifications.markRead(notification.id);
}
