import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createWorkshopSchema, workshopResponseSchema, type WorkshopResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateWorkshopDto extends createZodDto(createWorkshopSchema) {}

@ApiTags("workshops")
@Controller("workshops")
export class WorkshopsController {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  @RequirePermissions("contract_manufacturing.write")
  @Post()
  async create(
    @Body() body: CreateWorkshopDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<WorkshopResponseDto> {
    const workshop = await this.contractManufacturingService.createWorkshop(currentUser.companyId, body);
    return workshopResponseSchema.parse(workshop);
  }

  // Активные цеха компании (owner создаёт цех сразу активным — см.
  // createWorkshop; черновики от Inbox сюда не попадают, это отдельный
  // будущий сценарий, не Итерация 11).
  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<WorkshopResponseDto[]> {
    const workshops = await this.contractManufacturingService.listActiveWorkshops(currentUser.companyId);
    return workshops.map((workshop) => workshopResponseSchema.parse(workshop));
  }
}
