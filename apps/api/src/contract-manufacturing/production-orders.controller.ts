import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  confirmProductionOrderSchema,
  createProductionOrderSchema,
  productionOrderResponseSchema,
  type ProductionOrderResponseDto,
} from "@garmentos/shared-types";
import { ContractManufacturingService } from "./contract-manufacturing.service";

class CreateProductionOrderDto extends createZodDto(createProductionOrderSchema) {}
class ConfirmProductionOrderDto extends createZodDto(confirmProductionOrderSchema) {}

@ApiTags("production-orders")
@Controller("production-orders")
export class ProductionOrdersController {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  @Post()
  async create(@Body() body: CreateProductionOrderDto): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.createProductionOrderDraft(body);
    return productionOrderResponseSchema.parse(productionOrder);
  }

  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @Body() body: ConfirmProductionOrderDto,
  ): Promise<ProductionOrderResponseDto> {
    const productionOrder = await this.contractManufacturingService.confirmProductionOrder(body.companyId, id);
    return productionOrderResponseSchema.parse(productionOrder);
  }
}
