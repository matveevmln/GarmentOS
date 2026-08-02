import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createPurchaseOrderSchema,
  purchaseOrderResponseSchema,
  receivePurchaseOrderSchema,
  type PurchaseOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProcurementService } from "./procurement.service";

class CreatePurchaseOrderDto extends createZodDto(createPurchaseOrderSchema) {}
class ReceivePurchaseOrderDto extends createZodDto(receivePurchaseOrderSchema) {}

@ApiTags("purchase-orders")
@Controller("purchase-orders")
export class PurchaseOrdersController {
  constructor(private readonly procurementService: ProcurementService) {}

  @RequirePermissions("procurement.write")
  @Post()
  async create(
    @Body() body: CreatePurchaseOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.procurementService.createPurchaseOrderDraft(currentUser.companyId, body);
    return purchaseOrderResponseSchema.parse(purchaseOrder);
  }

  @RequirePermissions("procurement.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<PurchaseOrderResponseDto[]> {
    const purchaseOrders = await this.procurementService.listPurchaseOrders(currentUser.companyId);
    return purchaseOrders.map((order) => purchaseOrderResponseSchema.parse(order));
  }

  @RequirePermissions("procurement.write")
  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.procurementService.confirmPurchaseOrder(currentUser.companyId, id);
    return purchaseOrderResponseSchema.parse(purchaseOrder);
  }

  @RequirePermissions("procurement.write")
  @Post(":id/receive")
  async receive(
    @Param("id") id: string,
    @Body() body: ReceivePurchaseOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<PurchaseOrderResponseDto> {
    const purchaseOrder = await this.procurementService.receivePurchaseOrder(currentUser, id, body.warehouseId);
    return purchaseOrderResponseSchema.parse(purchaseOrder);
  }
}
