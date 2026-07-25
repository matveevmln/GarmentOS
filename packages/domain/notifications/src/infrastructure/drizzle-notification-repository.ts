import { notifications, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { Notification } from "../domain/notification";
import type { NewNotificationInput, NotificationRepository } from "../application/ports";

type NotificationRow = typeof notifications.$inferSelect;

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId,
    type: row.type,
    payloadJson: row.payloadJson,
    readAt: row.readAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewNotificationInput): Promise<Notification> {
    const [row] = await this.db.insert(notifications).values(input).returning();
    if (!row) throw new Error("INSERT notifications не вернул строку");
    return toNotification(row);
  }

  async findById(companyId: string, id: string): Promise<Notification | null> {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.companyId, companyId), eq(notifications.id, id)))
      .limit(1);
    return row ? toNotification(row) : null;
  }

  async markRead(id: string): Promise<Notification> {
    const [row] = await this.db
      .update(notifications)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(eq(notifications.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE notifications не нашёл строку id=${id}`);
    return toNotification(row);
  }
}
