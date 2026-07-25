import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { costEntryResponseSchema, recordCostEntrySchema, type CostEntryResponseDto } from "@garmentos/shared-types";
import { FinanceService } from "./finance.service";

class RecordCostEntryDto extends createZodDto(recordCostEntrySchema) {}

@ApiTags("cost-entries")
@Controller("cost-entries")
export class CostEntriesController {
  constructor(private readonly financeService: FinanceService) {}

  @Post()
  async record(@Body() body: RecordCostEntryDto): Promise<CostEntryResponseDto> {
    const costEntry = await this.financeService.recordCostEntry(body);
    return costEntryResponseSchema.parse(costEntry);
  }
}
