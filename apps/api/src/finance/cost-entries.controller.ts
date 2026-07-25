import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { costEntryResponseSchema, recordCostEntrySchema, type CostEntryResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { FinanceService } from "./finance.service";

class RecordCostEntryDto extends createZodDto(recordCostEntrySchema) {}

@ApiTags("cost-entries")
@Controller("cost-entries")
export class CostEntriesController {
  constructor(private readonly financeService: FinanceService) {}

  @RequirePermissions("finance.write")
  @Post()
  async record(
    @Body() body: RecordCostEntryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CostEntryResponseDto> {
    const costEntry = await this.financeService.recordCostEntry(currentUser.companyId, body);
    return costEntryResponseSchema.parse(costEntry);
  }
}
