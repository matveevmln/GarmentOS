import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { specificationPricingResponseSchema, type SpecificationPricingResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CostingService } from "./costing.service";

@ApiTags("costing")
@Controller("costing")
export class CostingController {
  constructor(private readonly costingService: CostingService) {}

  @RequirePermissions("catalog.read")
  @Get("products/:productId/specification-price")
  async getSpecificationPrice(
    @Param("productId") productId: string,
    @Query("deduction", new ParseIntPipe({ optional: true })) deduction: number | undefined,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SpecificationPricingResponseDto> {
    const pricing = await this.costingService.computeSpecificationPricing(currentUser.companyId, productId, deduction);
    return specificationPricingResponseSchema.parse(pricing);
  }
}
