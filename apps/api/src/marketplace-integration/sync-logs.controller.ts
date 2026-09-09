import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { recordSyncLogSchema, syncLogResponseSchema, type SyncLogResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

class RecordSyncLogDto extends createZodDto(recordSyncLogSchema) {}

@ApiTags("sync-logs")
@Controller("sync-logs")
export class SyncLogsController {
  constructor(private readonly marketplaceIntegrationService: MarketplaceIntegrationService) {}

  // marketplaceAccountId приходит из тела запроса — companyId берётся из
  // токена, принадлежность кабинета проверяет доменный use case (Step 4A.2).
  @RequirePermissions("marketplace_integration.write")
  @Post()
  async record(
    @Body() body: RecordSyncLogDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SyncLogResponseDto> {
    const syncLog = await this.marketplaceIntegrationService.recordSyncLog(currentUser.companyId, body);
    return syncLogResponseSchema.parse(syncLog);
  }
}
