import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { recordSyncLogSchema, syncLogResponseSchema, type SyncLogResponseDto } from "@garmentos/shared-types";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

class RecordSyncLogDto extends createZodDto(recordSyncLogSchema) {}

@ApiTags("sync-logs")
@Controller("sync-logs")
export class SyncLogsController {
  constructor(private readonly marketplaceIntegrationService: MarketplaceIntegrationService) {}

  @Post()
  async record(@Body() body: RecordSyncLogDto): Promise<SyncLogResponseDto> {
    const syncLog = await this.marketplaceIntegrationService.recordSyncLog(body);
    return syncLogResponseSchema.parse(syncLog);
  }
}
