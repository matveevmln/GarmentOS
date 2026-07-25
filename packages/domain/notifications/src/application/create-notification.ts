import { assertValidType, type Notification } from "../domain/notification";
import type { NotificationRepository } from "./ports";

export interface CreateNotificationInput {
  companyId: string;
  userId: string;
  type: string;
  payloadJson?: unknown;
}

export interface CreateNotificationDeps {
  notifications: NotificationRepository;
}

export async function createNotification(
  deps: CreateNotificationDeps,
  input: CreateNotificationInput,
): Promise<Notification> {
  const type = input.type.trim();
  assertValidType(type);

  return deps.notifications.create({
    companyId: input.companyId,
    userId: input.userId,
    type,
    payloadJson: input.payloadJson ?? null,
  });
}
