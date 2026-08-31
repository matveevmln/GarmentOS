import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createCuttingOrderSchema,
  cuttingFactResponseSchema,
  cuttingFactSchema,
  cuttingOrderResponseSchema,
  issueCuttingOrderSchema,
  type CuttingFactResponseDto,
  type CuttingOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CuttingService } from "./cutting.service";

class CreateCuttingOrderDto extends createZodDto(createCuttingOrderSchema) {}
class IssueCuttingOrderDto extends createZodDto(issueCuttingOrderSchema) {}
class CuttingFactDto extends createZodDto(cuttingFactSchema) {}

// Раскройное задание живёт внутри партии, поэтому создание и список висят на
// маршруте заказа; действия над конкретным заданием — на его собственном.
// Права — существующие contract_manufacturing.* (владелец проекта,
// 2026-08-30: отдельное разрешение сейчас не заводить).
@ApiTags("cutting")
@Controller()
export class CuttingOrdersController {
  constructor(private readonly cuttingService: CuttingService) {}

  @RequirePermissions("contract_manufacturing.write")
  @Post("production-orders/:id/cutting-orders")
  async create(
    @Param("id") productionOrderId: string,
    @Body() body: CreateCuttingOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingOrderResponseDto> {
    const order = await this.cuttingService.create(currentUser, productionOrderId, body);
    return cuttingOrderResponseSchema.parse(order);
  }

  @RequirePermissions("contract_manufacturing.read")
  @Get("production-orders/:id/cutting-orders")
  async listByProductionOrder(
    @Param("id") productionOrderId: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingOrderResponseDto[]> {
    const orders = await this.cuttingService.listByProductionOrder(currentUser.companyId, productionOrderId);
    return orders.map((order) => cuttingOrderResponseSchema.parse(order));
  }

  @RequirePermissions("contract_manufacturing.read")
  @Get("cutting-orders/:id")
  async findById(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingOrderResponseDto> {
    const order = await this.cuttingService.findById(currentUser.companyId, id);
    if (!order) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "CUTTING_ORDER_NOT_FOUND",
        message: `Раскройное задание ${id} не найдено`,
      });
    }
    return cuttingOrderResponseSchema.parse(order);
  }

  // Выдача в крой фиксирует план и «выделено». Склад при этом не трогается —
  // расход проводится только по факту.
  @RequirePermissions("contract_manufacturing.write")
  @Post("cutting-orders/:id/issue")
  async issue(
    @Param("id") id: string,
    @Body() body: IssueCuttingOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingOrderResponseDto> {
    const order = await this.cuttingService.issue(currentUser, id, body);
    return cuttingOrderResponseSchema.parse(order);
  }

  // Внесение факта — единственная точка фактического списания материала.
  // Нехватка остатка не блокирует: ответ содержит расхождения, интерфейс
  // показывает их предупреждением.
  @RequirePermissions("contract_manufacturing.write")
  @Post("cutting-orders/:id/result")
  async recordFact(
    @Param("id") id: string,
    @Body() body: CuttingFactDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingFactResponseDto> {
    const outcome = await this.cuttingService.recordFact(currentUser, id, body);
    return cuttingFactResponseSchema.parse(outcome);
  }

  // Исправление уже внесённого факта: корректирующее движение на разницу
  // плюс запись «было → стало» в журнал изменений.
  @RequirePermissions("contract_manufacturing.write")
  @Post("cutting-orders/:id/correct")
  async correctFact(
    @Param("id") id: string,
    @Body() body: CuttingFactDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingFactResponseDto> {
    const outcome = await this.cuttingService.correctFact(currentUser, id, body);
    return cuttingFactResponseSchema.parse(outcome);
  }

  @RequirePermissions("contract_manufacturing.write")
  @Post("cutting-orders/:id/cancel")
  async cancel(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<CuttingOrderResponseDto> {
    const order = await this.cuttingService.cancel(currentUser, id);
    return cuttingOrderResponseSchema.parse(order);
  }
}
