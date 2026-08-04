import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { pilotDashboardResponseSchema, type PilotDashboardResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { PilotDashboardService } from "./pilot-dashboard.service";

// Без @RequirePermissions — тот же принцип, что attention.controller.ts:
// "система работает штатно" не разрез по правам конкретного модуля.
@ApiTags("reporting")
@Controller("pilot-dashboard")
export class PilotDashboardController {
  constructor(private readonly pilotDashboardService: PilotDashboardService) {}

  @Get()
  async getDashboard(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<PilotDashboardResponseDto> {
    const dashboard = await this.pilotDashboardService.getDashboard(currentUser.companyId);
    return pilotDashboardResponseSchema.parse(dashboard);
  }
}
