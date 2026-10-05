import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  ParseBoolPipe,
} from "@nestjs/common";
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

  // Реквизиты необязательны для партии (ADR 0004). Архив исключает цех
  // из новых заказов, но сохраняет историю и возможность восстановления.
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
  async list(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query("includeArchived", new ParseBoolPipe({ optional: true })) includeArchived?: boolean,
  ): Promise<WorkshopResponseDto[]> {
    const workshops = await this.contractManufacturingService.listActiveWorkshops(
      currentUser.companyId,
      includeArchived,
    );
    return workshops.map((workshop) => workshopResponseSchema.parse(workshop));
  }

  // Карточка спецификации (Этап 2 — «Паспорт модели») открывается по прямой
  // ссылке и показывает выбранный цех сама по себе, без предзагруженного
  // списка — недостающий минимальный эндпоинт, не переделка существующего
  // контракта (список/создание/правка выше не затронуты).
  @RequirePermissions("contract_manufacturing.read")
  @Get(":id")
  async findById(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<WorkshopResponseDto> {
    const workshop = await this.contractManufacturingService.findWorkshopById(currentUser.companyId, id);
    if (!workshop) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "WORKSHOP_NOT_FOUND", message: `Цех ${id} не найден` });
    }
    return workshopResponseSchema.parse(workshop);
  }
}
