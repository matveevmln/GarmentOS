import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createWorkshopSchema, workshopResponseSchema, type WorkshopResponseDto } from "@garmentos/shared-types";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateWorkshopDto extends createZodDto(createWorkshopSchema) {}

@ApiTags("workshops")
@Controller("workshops")
export class WorkshopsController {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  @Post()
  async create(@Body() body: CreateWorkshopDto): Promise<WorkshopResponseDto> {
    const workshop = await this.contractManufacturingService.createWorkshop(body);
    return workshopResponseSchema.parse(workshop);
  }
}
