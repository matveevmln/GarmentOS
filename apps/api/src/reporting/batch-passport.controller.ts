import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { batchPassportResponseSchema, type BatchPassportResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { BatchPassportService } from "./batch-passport.service";

// «Паспорт партии» — тот же URL-префикс "production-orders", что и у
// ProductionOrdersController (contract-manufacturing) и
// ProductionOrderSpecificationController (ai-production-assistant): один
// заказ пошива обслуживается тремя контроллерами в трёх модулях, каждый
// владеет своим срезом (CRUD / оркестрация подтверждения / read-модель),
// без циклических импортов между модулями (см. комментарий в
// contract-manufacturing/production-orders.controller.ts).
@ApiTags("reporting")
@Controller("production-orders")
export class BatchPassportController {
  constructor(private readonly batchPassportService: BatchPassportService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get(":id/passport")
  async getPassport(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<BatchPassportResponseDto> {
    const passport = await this.batchPassportService.getPassport(currentUser.companyId, id);
    return batchPassportResponseSchema.parse(passport);
  }
}
