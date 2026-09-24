import { Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createSewingOrderDraftSchema,
  placeSewingOrderSchema,
  sewingOrderResponseSchema,
  sewingOrderWithProductionOrdersResponseSchema,
  updateSewingOrderDraftSchema,
  type SewingOrderResponseDto,
  type SewingOrderWithProductionOrdersResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateSewingOrderDraftDto extends createZodDto(createSewingOrderDraftSchema) {}
class UpdateSewingOrderDraftDto extends createZodDto(updateSewingOrderDraftSchema) {}
class PlaceSewingOrderDto extends createZodDto(placeSewingOrderSchema) {}

// Заказ на пошив — общая шапка над одной или несколькими партиями по
// моделям (ADR 0002, «Штаб партии v1», владелец проекта, 2026-09-24).
// Существующий /production-orders (одна модель — одна партия) не меняется:
// этот контроллер добавляет шапку поверх него, партии по-прежнему создаются
// как ProductionOrder (packages/domain/contract-manufacturing).
@ApiTags("sewing-orders")
@Controller("sewing-orders")
export class SewingOrdersController {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  // A02 «Сохранить черновик» — допускает неполные данные (без цеха, без
  // единой модели). companyId и createdBy — из доверенного контекста
  // авторизации, не из тела запроса.
  @RequirePermissions("contract_manufacturing.write")
  @Post()
  async createDraft(
    @Body() body: CreateSewingOrderDraftDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SewingOrderResponseDto> {
    const sewingOrder = await this.contractManufacturingService.createSewingOrderDraft(currentUser, body);
    return sewingOrderResponseSchema.parse(sewingOrder);
  }

  // Автосохранение формы — только для status='draft'; version проверяется
  // атомарно (409 при конфликте двух вкладок, ADR 0002).
  @RequirePermissions("contract_manufacturing.write")
  @Patch(":id")
  async updateDraft(
    @Param("id") id: string,
    @Body() body: UpdateSewingOrderDraftDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SewingOrderResponseDto> {
    const sewingOrder = await this.contractManufacturingService.updateSewingOrderDraft(currentUser, id, body);
    return sewingOrderResponseSchema.parse(sewingOrder);
  }

  @RequirePermissions("contract_manufacturing.write")
  @Delete(":id")
  async deleteDraft(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<{ removed: true }> {
    const removed = await this.contractManufacturingService.deleteSewingOrderDraft(currentUser.companyId, id);
    if (!removed) {
      throw new NotFoundException({ statusCode: 404, code: "SEWING_ORDER_DRAFT_NOT_FOUND", message: "Черновик не найден" });
    }
    return { removed: true };
  }

  // «Создать заказ» (A02) — одно действие: атомарно создаёт шапку в статусе
  // placed и одну партию на каждую модель, сразу в placed (ADR 0002,
  // TRANSITION-REVIEW пункт 1 — без отдельного подтверждения каждой
  // партии). Идемпотентно по clientRequestId в теле запроса.
  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/place")
  async place(
    @Param("id") id: string,
    @Body() body: PlaceSewingOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SewingOrderWithProductionOrdersResponseDto> {
    const result = await this.contractManufacturingService.placeSewingOrder(currentUser, id, body);
    return sewingOrderWithProductionOrdersResponseSchema.parse({
      ...result.sewingOrder,
      productionOrders: result.productionOrders,
    });
  }

  // Штаб заказа (B01 basic) — шапка вместе с уже размещёнными партиями.
  @RequirePermissions("contract_manufacturing.read")
  @Get(":id")
  async getOne(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SewingOrderWithProductionOrdersResponseDto> {
    const result = await this.contractManufacturingService.getSewingOrderWithProductionOrders(
      currentUser.companyId,
      id,
    );
    if (!result) {
      throw new NotFoundException({ statusCode: 404, code: "SEWING_ORDER_NOT_FOUND", message: `Заказ на пошив ${id} не найден` });
    }
    return sewingOrderWithProductionOrdersResponseSchema.parse({
      ...result.sewingOrder,
      productionOrders: result.productionOrders,
    });
  }

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<SewingOrderResponseDto[]> {
    const sewingOrders = await this.contractManufacturingService.listSewingOrders(currentUser.companyId);
    return sewingOrders.map((sewingOrder) => sewingOrderResponseSchema.parse(sewingOrder));
  }
}
