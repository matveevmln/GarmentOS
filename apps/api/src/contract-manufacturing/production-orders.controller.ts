import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductionOrderSchema,
  productionOrderResponseSchema,
  type ProductionOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateProductionOrderDto extends createZodDto(createProductionOrderSchema) {}

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
}
