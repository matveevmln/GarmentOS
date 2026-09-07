import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { attentionResponseSchema, type AttentionResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AttentionService } from "./attention.service";

// Без @RequirePermissions — доступен любому аутентифицированному пользователю
// компании (тот же принцип, что notifications, см. auth/permissions.guard.ts):
// «что требует внимания сегодня» — не разрез по правам конкретного модуля, а
// сводка для владельца бренда независимо от роли.
@ApiTags("reporting")
@Controller("attention")
export class AttentionController {
  constructor(private readonly attentionService: AttentionService) {}

  @Get()
  async getAttention(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<AttentionResponseDto> {
    const attention = await this.attentionService.getAttention(currentUser.companyId);
    return attentionResponseSchema.parse(attention);
  }
}
