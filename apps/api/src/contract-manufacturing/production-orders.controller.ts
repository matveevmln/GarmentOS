import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductionOrderSchema,
  productionOrderResponseSchema,
  receiveProductionOrderSchema,
  type ProductionOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateProductionOrderDto extends createZodDto(createProductionOrderSchema) {}
class ReceiveProductionOrderDto extends createZodDto(receiveProductionOrderSchema) {}

@ApiTags("production-orders")
@Controller("production-orders")
export class ProductionOrdersController {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  @RequirePermissions("contract_manufacturing.write")
  @Post()
  async create(
    @Body() body: CreateProductionOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.createProductionOrderDraft(
      currentUser.companyId,
      body,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.confirmProductionOrder(
      currentUser.companyId,
      id,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  // Приёмка партии на склад (Итерация 10) — доступна только когда цех
  // сообщил "готово к отгрузке" (assertCanReceive), склад выбирается тем, кто
  // принимает партию физически.
  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/receive")
  async receive(
    @Param("id") id: string,
    @Body() body: ReceiveProductionOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.receiveProductionOrder(
      currentUser,
      id,
      body.warehouseId,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  // Показ заказа пошива и его статуса — минимум, нужный вертикальному
  // сценарию Итерации 7 (docs/ROADMAP.md), не read-слой для всех операций.
  @RequirePermissions("contract_manufacturing.read")
  @Get(":id")
  async findById(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.findProductionOrderById(
      currentUser.companyId,
      id,
    );
    if (!productionOrder) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "PRODUCTION_ORDER_NOT_FOUND",
        message: `Заказ пошива ${id} не найден`,
      });
    }
    return productionOrderResponseSchema.parse(productionOrder);
  }
}
