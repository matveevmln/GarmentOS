import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  confirmPurchaseOrderSchema,
  createPurchaseOrderSchema,
  purchaseOrderResponseSchema,
  type PurchaseOrderResponseDto,
} from "@garmentos/shared-types";
import { ProcurementService } from "./procurement.service";

class CreatePurchaseOrderDto extends createZodDto(createPurchaseOrderSchema) {}
class ConfirmPurchaseOrderDto extends createZodDto(confirmPurchaseOrderSchema) {}

@ApiTags("purchase-orders")
@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Post()
  async create(@Body() body: CreatePurchaseOrderDto): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.procurementService.createPurchaseOrderDraft(body);
    return purchaseOrderResponseSchema.parse(purchaseOrder);
  }

  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @Body() body: ConfirmPurchaseOrderDto,
  ): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.procurementService.confirmPurchaseOrder(body.companyId, id);
    return purchaseOrderResponseSchema.parse(purchaseOrder);
  }
}
