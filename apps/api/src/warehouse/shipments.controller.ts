import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createShipmentSchema,
  shipmentActionSchema,
  shipmentResponseSchema,
  type ShipmentResponseDto,
} from "@garmentos/shared-types";
import { WarehouseService } from "./warehouse.service";

class CreateShipmentDto extends createZodDto(createShipmentSchema) {}
class ShipmentActionDto extends createZodDto(shipmentActionSchema) {}

@ApiTags("shipments")
@Controller("shipments")
export class ShipmentsController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  async create(@Body() body: CreateShipmentDto): Promise<ShipmentResponseDto> {
    const shipment = await this.warehouseService.createShipment(body);
    return shipmentResponseSchema.parse(shipment);
  }

  @Post(":id/dispatch")
  async dispatch(@Param("id") id: string, @Body() body: ShipmentActionDto): Promise<ShipmentResponseDto> {
    const shipment = await this.warehouseService.dispatchShipment(body.companyId, id);
    return shipmentResponseSchema.parse(shipment);
  }

  @Post(":id/deliver")
  async deliver(@Param("id") id: string, @Body() body: ShipmentActionDto): Promise<ShipmentResponseDto> {
    const shipment = await this.warehouseService.markShipmentDelivered(body.companyId, id);
    return shipmentResponseSchema.parse(shipment);
  }
}
