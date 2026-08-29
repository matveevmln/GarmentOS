import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createWorkshopSchema,
  updateWorkshopSchema,
  workshopResponseSchema,
  type WorkshopResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateWorkshopDto extends createZodDto(createWorkshopSchema) {}
class UpdateWorkshopDto extends createZodDto(updateWorkshopSchema) {}

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

  // Правка карточки цеха (Pilot v1, этап 1). Договорные реквизиты
  // (номер/дата договора, условия оплаты, способ доставки, подписанты) до
  // этого задавались только при создании — а подтверждение заказа пошива
  // требует номер договора и отсылает пользователя «заполнить его в карточке
  // цеха». Уже подтверждённые заказы правка не затрагивает: их реквизиты
  // зафиксированы в Snapshot партии.
  @RequirePermissions("contract_manufacturing.write")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: UpdateWorkshopDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<WorkshopResponseDto> {
    const workshop = await this.contractManufacturingService.updateWorkshop(currentUser, id, body);
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
