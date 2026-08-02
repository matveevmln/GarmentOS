import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createWarehouseSchema, warehouseResponseSchema, type WarehouseResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { WarehouseService } from "./warehouse.service";

class CreateWarehouseDto extends createZodDto(createWarehouseSchema) {}

@ApiTags("warehouses")
@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @RequirePermissions("warehouse.write")
  @Post()
  async create(
    @Body() body: CreateWarehouseDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<WarehouseResponseDto> {
    const warehouse = await this.warehouseService.createWarehouse(currentUser.companyId, body);
    return warehouseResponseSchema.parse(warehouse);
  }
}
