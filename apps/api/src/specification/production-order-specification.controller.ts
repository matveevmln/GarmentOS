import { Controller, Post, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { specificationResponseSchema, type SpecificationResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { SpecificationService } from "./specification.service";

// Создание спецификации ИЗ уже существующего заказа (ПРОМПТ №3, раздел 4) —
// живёт в SpecificationModule (не в ContractManufacturingModule), потому что
// SpecificationModule уже импортирует ContractManufacturingModule
// (однонаправленно); обратный импорт создал бы цикл модулей NestJS. Тот же
// приём, что и production-order-specification.controller.ts в
// ai-production-assistant — второй контроллер с префиксом "production-orders"
// в другом модуле, маршруты не пересекаются (там ":id/confirm", здесь
// ":id/specification").
@ApiTags("production-orders")
@Controller("production-orders")
export class CreateSpecificationFromOrderController {
  constructor(private readonly specificationService: SpecificationService) {}

  @RequirePermissions("specification.write")
  @Post(":id/specification")
  async createFromOrder(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationResponseDto> {
    const spec = await this.specificationService.createFromProductionOrder(currentUser.companyId, id, currentUser.id);
    return specificationResponseSchema.parse(spec);
  }
}
