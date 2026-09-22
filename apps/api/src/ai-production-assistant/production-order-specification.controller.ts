import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  cancelProductionOrderSchema,
  documentResponseSchema,
  productionOrderResponseSchema,
  type DocumentResponseDto,
  type ProductionOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProductionOrderOrchestrationService } from "./production-order-orchestration.service";

class CancelProductionOrderDto extends createZodDto(cancelProductionOrderSchema) {}

// Генерация спецификации по подтверждённому заказу пошива + отправка цеху в
// Telegram, если чат привязан (Итерация 7, вертикальный сценарий).
// Подтверждение заказа тоже здесь (не в contract-manufacturing/production-orders.controller.ts) —
// оно обязано фиксировать Snapshot партии через CostingService (owner,
// 2026-08-03 — «Паспорт партии»), см. комментарий в том контроллере.
@ApiTags("ai-production-assistant")
@Controller("production-orders")
export class ProductionOrderSpecificationController {
  constructor(private readonly orchestrationService: ProductionOrderOrchestrationService) {}

  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.orchestrationService.confirmProductionOrder(
      currentUser.companyId,
      id,
      currentUser.id,
    );
    return productionOrderResponseSchema.parse(productionOrder);
  }

  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/generate-specification")
  async generateSpecification(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DocumentResponseDto> {
    const document = await this.orchestrationService.generateAndSendSpecification(
      currentUser.companyId,
      id,
      currentUser.id,
    );
    return documentResponseSchema.parse(document);
  }

  // Акт приёмки оказанных услуг (владелец проекта, 2026-09-21) — доступен
  // только после приёмки партии на склад (SpecificationService.generateAct
  // проверяет order.receivedAt); permission та же, что у спецификации —
  // формирование документов заказа принадлежит тому же праву, не отдельному.
  @RequirePermissions("contract_manufacturing.write")
  @Post(":id/generate-act")
  async generateAct(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DocumentResponseDto> {
    const document = await this.orchestrationService.generateAndSendAct(currentUser.companyId, id, currentUser.id);
    return documentResponseSchema.parse(document);
  }

  // Отмена заказа пошива (владелец проекта, 2026-09-22) — своё право
  // (contract_manufacturing.cancel, миграция 0034), тот же класс риска, что
  // rollback: только owner/director по умолчанию. Причина обязательна
  // (валидируется схемой и ещё раз доменом). Здесь, а не в
  // contract-manufacturing/production-orders.controller.ts, потому что
  // каскадная отмена требует SpecificationService/CuttingService — см.
  // комментарий у ProductionOrderOrchestrationService.cancelProductionOrder.
  @RequirePermissions("contract_manufacturing.cancel")
  @Post(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @Body() body: CancelProductionOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.orchestrationService.cancelProductionOrder(currentUser, id, body.reason);
    return productionOrderResponseSchema.parse(productionOrder);
  }
}
