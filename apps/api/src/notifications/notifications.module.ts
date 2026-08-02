import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import { DrizzleNotificationRepository } from "@garmentos/domain-notifications";
import { DATABASE_CONNECTION } from "../database/database.module";
import { NotificationsController } from "./notifications.controller";
import { NOTIFICATION_REPOSITORY } from "./notifications.tokens";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NOTIFICATION_REPOSITORY,
      useFactory: (db: Database) => new DrizzleNotificationRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class NotificationsModule {}
