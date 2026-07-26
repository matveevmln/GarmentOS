import { Body, Controller, ForbiddenException, Headers, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { telegramInviteResponseSchema, type TelegramInviteResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { Public } from "../auth/public.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { telegramUpdateSchema } from "./telegram-update.schema";
import { TelegramService } from "./telegram.service";

@ApiTags("telegram")
@Controller("telegram")
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Одноразовый инвайт для конкретного цеха (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md,
  // раздел 1-2) — узкий сценарий Итерации 7 не включает инвайт для
  // пользователей компании (владелец получает его отдельно, вне API).
  @RequirePermissions("contract_manufacturing.write")
  @Post("invites/workshop/:workshopId")
  async createWorkshopInvite(
    @Param("workshopId") workshopId: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<TelegramInviteResponseDto> {
    const invite = await this.telegramService.createWorkshopInvite(currentUser.companyId, workshopId);
    return telegramInviteResponseSchema.parse(invite);
  }

  // Telegram сам не аутентифицируется через JWT системы — проверяется
  // секретным заголовком, который Telegram присылает на каждый webhook-вызов
  // (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 4).
  @Public()
  @HttpCode(200)
  @Post("webhook")
  async webhook(
    @Body() body: unknown,
    @Headers("x-telegram-bot-api-secret-token") secretHeader: string | undefined,
  ): Promise<{ ok: true }> {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && secretHeader !== expectedSecret) {
      throw new ForbiddenException("Неверный секрет webhook");
    }

    const update = telegramUpdateSchema.parse(body);
    await this.telegramService.handleUpdate(update);
    return { ok: true };
  }
}
