import { Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { documentResponseSchema, productionOrderResponseSchema, type DocumentResponseDto, type ProductionOrderResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProductionOrderOrchestrationService } from "./production-order-orchestration.service";

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
}
