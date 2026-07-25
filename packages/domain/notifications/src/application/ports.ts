import type { Notification } from "../domain/notification";

export interface NewNotificationInput {
  companyId: string;
  userId: string;
  type: string;
  payloadJson: unknown;
}

export interface NotificationRepository {
  create(input: NewNotificationInput): Promise<Notification>;
  findById(companyId: string, id: string): Promise<Notification | null>;
  markRead(id: string): Promise<Notification>;
}
