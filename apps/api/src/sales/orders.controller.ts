import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createOrderSchema,
  orderResponseSchema,
  transitionOrderStatusSchema,
  type OrderResponseDto,
} from "@garmentos/shared-types";
import { SalesService } from "./sales.service";

class CreateOrderDto extends createZodDto(createOrderSchema) {}
class TransitionOrderStatusDto extends createZodDto(transitionOrderStatusSchema) {}

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  async create(@Body() body: CreateOrderDto): Promise<OrderResponseDto> {
    const order = await this.salesService.createOrder(body);
    return orderResponseSchema.parse(order);
  }

  @Post(":id/confirm")
  async confirm(@Param("id") id: string, @Body() body: TransitionOrderStatusDto): Promise<OrderResponseDto> {
    const order = await this.salesService.confirmOrder(body.companyId, id);
    return orderResponseSchema.parse(order);
  }

  @Post(":id/ship")
  async ship(@Param("id") id: string, @Body() body: TransitionOrderStatusDto): Promise<OrderResponseDto> {
    const order = await this.salesService.shipOrder(body.companyId, id);
    return orderResponseSchema.parse(order);
  }

  @Post(":id/deliver")
  async deliver(@Param("id") id: string, @Body() body: TransitionOrderStatusDto): Promise<OrderResponseDto> {
    const order = await this.salesService.deliverOrder(body.companyId, id);
    return orderResponseSchema.parse(order);
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @Body() body: TransitionOrderStatusDto): Promise<OrderResponseDto> {
    const order = await this.salesService.cancelOrder(body.companyId, id);
    return orderResponseSchema.parse(order);
  }
}
