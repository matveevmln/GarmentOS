import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createShipmentSchema, shipmentResponseSchema, type ShipmentResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { WarehouseService } from "./warehouse.service";

class CreateShipmentDto extends createZodDto(createShipmentSchema) {}

@ApiTags("shipments")
@Controller("shipments")
export class ShipmentsController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @RequirePermissions("warehouse.write")
  @Post()
  async create(
    @Body() body: CreateShipmentDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ShipmentResponseDto> {
    const shipment = await this.warehouseService.createShipment(currentUser.companyId, body);
    return shipmentResponseSchema.parse(shipment);
  }

  @RequirePermissions("warehouse.write")
  @Post(":id/dispatch")
  async dispatch(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ShipmentResponseDto> {
    const shipment = await this.warehouseService.dispatchShipment(currentUser.companyId, id);
    return shipmentResponseSchema.parse(shipment);
  }

  @RequirePermissions("warehouse.write")
  @Post(":id/deliver")
  async deliver(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ShipmentResponseDto> {
    const shipment = await this.warehouseService.markShipmentDelivered(currentUser.companyId, id);
    return shipmentResponseSchema.parse(shipment);
  }
}
