import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createNotificationSchema,
  markNotificationReadSchema,
  notificationResponseSchema,
  type NotificationResponseDto,
} from "@garmentos/shared-types";
import { NotificationsService } from "./notifications.service";

class CreateNotificationDto extends createZodDto(createNotificationSchema) {}
class MarkNotificationReadDto extends createZodDto(markNotificationReadSchema) {}

@ApiTags("notifications")
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async create(@Body() body: CreateNotificationDto): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.create(body);
    return notificationResponseSchema.parse(notification);
  }

  @Post(":id/read")
  async markRead(@Param("id") id: string, @Body() body: MarkNotificationReadDto): Promise<NotificationResponseDto> {
    const notification = await this.notificationsService.markRead(body.companyId, id);
    return notificationResponseSchema.parse(notification);
  }
}
