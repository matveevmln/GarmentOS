import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductionOrderFromQuantitySchema,
  createProductionOrderSchema,
  previewProductionOrderVariantsResponseSchema,
  previewProductionOrderVariantsSchema,
  productionOrderResponseSchema,
  receiveProductionOrderSchema,
  type PreviewProductionOrderVariantsResponseDto,
  type ProductionOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateProductionOrderDto extends createZodDto(createProductionOrderSchema) {}
class CreateProductionOrderFromQuantityDto extends createZodDto(createProductionOrderFromQuantitySchema) {}
class ReceiveProductionOrderDto extends createZodDto(receiveProductionOrderSchema) {}
class PreviewProductionOrderVariantsDto extends createZodDto(previewProductionOrderVariantsSchema) {}

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

  // Предпросмотр матрицы размер × цвет до сохранения заказа (владелец
  // проекта, 2026-08-30): пользователь видит раскладку, может поправить
  // отдельные ячейки и только потом сохраняет. Считается на сервере, чтобы
  // показанные числа в точности совпали с сохранёнными.
  @RequirePermissions("contract_manufacturing.read")
  @Post("preview-variants")
  async previewVariants(
    @Body() body: PreviewProductionOrderVariantsDto,
  ): Promise<PreviewProductionOrderVariantsResponseDto> {
    const preview = await this.contractManufacturingService.previewProductionOrderVariants(body);
    return previewProductionOrderVariantsResponseSchema.parse(preview);
  }

  // «Указываю только модель и общее количество» (владелец проекта,
  // 2026-08-03) — размерный ряд распределяется автоматически
  // (createProductionOrderDraftFromTotalQuantity).
  @RequirePermissions("contract_manufacturing.write")
  @Post("from-quantity")
  async createFromQuantity(
    @Body() body: CreateProductionOrderFromQuantityDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.createProductionOrderDraftFromTotalQuantity(
      currentUser.companyId,
      body,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  // Подтверждение заказа (":id/confirm") намеренно НЕ в этом контроллере —
  // подтверждение обязано фиксировать Snapshot партии (owner, 2026-08-03 —
  // «Паспорт партии»), а это требует CostingService из ai-production-assistant
  // (ProductionOrderOrchestrationService.confirmProductionOrder), импорт
  // которого сюда создал бы цикл модулей (тот модуль уже импортирует этот).
  // Эндпоинт — production-order-specification.controller.ts, тот же
  // "production-orders" префикс.

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

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<ProductionOrderResponseDto[]> {
    const productionOrders = await this.contractManufacturingService.listProductionOrders(currentUser.companyId);
    return productionOrders.map((order) => productionOrderResponseSchema.parse(order));
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
