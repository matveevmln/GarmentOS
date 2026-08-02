import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createNotificationSchema, notificationResponseSchema, type NotificationResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { NotificationsService } from "./notifications.service";

class CreateNotificationDto extends createZodDto(createNotificationSchema) {}

// notifications не подчиняется ролевой матрице (docs/AUTH_ARCHITECTURE.md,
// раздел 6-7) — намеренно без @RequirePermissions: доступ к чтению/отметке
// определяется владением записью (userId), проверяется в доменном use case.
@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async create(
    @Body() body: CreateNotificationDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.create(currentUser.companyId, body);
    return notificationResponseSchema.parse(notification);
  }

  @Post(":id/read")
  async markRead(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.markRead(currentUser.companyId, currentUser.id, id);
    return notificationResponseSchema.parse(notification);
  }
}
