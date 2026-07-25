import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createOrderSchema, orderResponseSchema, type OrderResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { SalesService } from "./sales.service";

class CreateOrderDto extends createZodDto(createOrderSchema) {}

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions("sales.write")
  @Post()
  async create(
    @Body() body: CreateOrderDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<OrderResponseDto> {
    const order = await this.salesService.createOrder(currentUser.companyId, body);
    return orderResponseSchema.parse(order);
  }

  @RequirePermissions("sales.write")
  @Post(":id/confirm")
  async confirm(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<OrderResponseDto> {
    const order = await this.salesService.confirmOrder(currentUser.companyId, id);
    return orderResponseSchema.parse(order);
  }

  @RequirePermissions("sales.write")
  @Post(":id/ship")
  async ship(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<OrderResponseDto> {
    const order = await this.salesService.shipOrder(currentUser.companyId, id);
    return orderResponseSchema.parse(order);
  }

  @RequirePermissions("sales.write")
  @Post(":id/deliver")
  async deliver(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<OrderResponseDto> {
    const order = await this.salesService.deliverOrder(currentUser.companyId, id);
    return orderResponseSchema.parse(order);
  }

  @RequirePermissions("sales.write")
  @Post(":id/cancel")
  async cancel(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<OrderResponseDto> {
    const order = await this.salesService.cancelOrder(currentUser.companyId, id);
    return orderResponseSchema.parse(order);
  }
}
