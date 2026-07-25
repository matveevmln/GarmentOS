import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createWarehouseSchema, warehouseResponseSchema, type WarehouseResponseDto } from "@garmentos/shared-types";
import { WarehouseService } from "./warehouse.service";

class CreateWarehouseDto extends createZodDto(createWarehouseSchema) {}

@ApiTags("warehouses")
@Controller("warehouses")
export class WarehousesController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  async create(@Body() body: CreateWarehouseDto): Promise<WarehouseResponseDto> {
    const warehouse = await this.warehouseService.createWarehouse(body);
    return warehouseResponseSchema.parse(warehouse);
  }
}
