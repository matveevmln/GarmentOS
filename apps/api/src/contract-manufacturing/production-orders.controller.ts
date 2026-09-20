import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductionOrderFromQuantitySchema,
  createProductionOrderSchema,
  listProductionOrdersQuerySchema,
  previewProductionOrderVariantsResponseSchema,
  previewProductionOrderVariantsSchema,
  productionOrderResponseSchema,
  receiveProductionOrderSchema,
  rollbackProductionOrderStatusResponseSchema,
  rollbackProductionOrderStatusSchema,
  updateProductionOrderStatusSchema,
  type PreviewProductionOrderVariantsResponseDto,
  type ProductionOrderResponseDto,
  type RollbackProductionOrderStatusResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateProductionOrderDto extends createZodDto(createProductionOrderSchema) {}
class CreateProductionOrderFromQuantityDto extends createZodDto(createProductionOrderFromQuantitySchema) {}
class ReceiveProductionOrderDto extends createZodDto(receiveProductionOrderSchema) {}
class PreviewProductionOrderVariantsDto extends createZodDto(previewProductionOrderVariantsSchema) {}
class UpdateProductionOrderStatusDto extends createZodDto(updateProductionOrderStatusSchema) {}
class RollbackProductionOrderStatusDto extends createZodDto(rollbackProductionOrderStatusSchema) {}
class ListProductionOrdersQueryDto extends createZodDto(listProductionOrdersQuerySchema) {}

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
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<PreviewProductionOrderVariantsResponseDto> {
    const preview = await this.contractManufacturingService.previewProductionOrderVariants(
      currentUser.companyId,
      body,
    );
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

  // REST-путь смены статуса (P0-1, владелец проекта, 2026-09-05) — переходы,
  // которые сегодня приходят только через Telegram-ответ цеха
  // (updateProductionOrderStatusFromWorkshop), но Telegram не настроен ни для
  // одного цеха на пилоте: без этого эндпоинта партия физически не может
  // дойти дальше "Размещён" через интерфейс. "received" сюда не входит —
  // это отдельный эндпоинт ниже (receive), потому что зачисляет остаток на
  // склад, а не просто меняет статус.
  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Body() body: UpdateProductionOrderStatusDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.updateProductionOrderStatus(
      currentUser.companyId,
      id,
      body.status,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  // Контролируемый rollback (ПРОМПТ №2.1, раздел C / ПРОМПТ №3, раздел 9) —
  // отдельное право (не contract_manufacturing.write): только owner/director
  // по умолчанию (миграция 0033). reason обязателен (валидируется схемой);
  // целевой статус вычисляется доменом, не принимается от клиента.
  @RequirePermissions("contract_manufacturing.rollback")
  @Post(":id/rollback-status")
  async rollbackStatus(
    @Param("id") id: string,
    @Body() body: RollbackProductionOrderStatusDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<RollbackProductionOrderStatusResponseDto> {
    const result = await this.contractManufacturingService.rollbackProductionOrderStatus(currentUser, id, body.reason);
    return rollbackProductionOrderStatusResponseSchema.parse(result);
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
      body.receivedVariants,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  // Завершение партии (ПРОМПТ №10.1/10.2, владелец проекта, 2026-09-15) —
  // отдельное явное действие, доступно только после приёмки (assertCanComplete).
  // Не зависит от ОТК: production_order_qc_results — независимый факт, не
  // статус, и его наличие/отсутствие не проверяется здесь намеренно (warn,
  // не block — решает вызывающий UI, не backend).
  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/complete")
  async complete(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.completeProductionOrder(currentUser, id);
    return productionOrderResponseSchema.parse(productionOrder);
  }

  // ?productId= — партии одной модели (Model-first Minimal Core, ПРОМПТ
  // №06.1). Необязателен: без него список ведёт себя ровно как раньше
  // (обратная совместимость).
  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async list(
    @Query() query: ListProductionOrdersQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto[]> {
    const productionOrders = query.productId
      ? await this.contractManufacturingService.listProductionOrdersByProduct(currentUser.companyId, query.productId)
      : await this.contractManufacturingService.listProductionOrders(currentUser.companyId);
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
