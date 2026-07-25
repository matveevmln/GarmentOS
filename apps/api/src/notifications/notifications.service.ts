import { Inject, Injectable } from "@nestjs/common";
import {
  createNotification,
  markNotificationRead,
  type Notification,
  type NotificationRepository,
} from "@garmentos/domain-notifications";
import type { CreateNotificationDto } from "@garmentos/shared-types";
import { NOTIFICATION_REPOSITORY } from "./notifications.tokens";

// Тонкий presentation-адаптер поверх packages/domain/notifications
// (docs/ARCHITECTURE.md, раздел 2) — репозиторий внедряется через DI по
// токену доменного порта.
@Injectable()
export class NotificationsService {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private readonly notifications: NotificationRepository) {}

  async create(companyId: string, input: CreateNotificationDto): Promise<Notification> {
    return createNotification({ notifications: this.notifications }, { ...input, companyId });
  }

  async markRead(companyId: string, userId: string, notificationId: string): Promise<Notification> {
    return markNotificationRead({ notifications: this.notifications }, { companyId, userId, notificationId });
  }
}
