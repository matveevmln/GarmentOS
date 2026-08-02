import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createInventoryCountSchema,
  inventoryCountResponseSchema,
  recordInventoryCountItemSchema,
  type InventoryCountResponseDto,
} from "@garmentos/shared-types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { WarehouseService } from "./warehouse.service";

class CreateInventoryCountDto extends createZodDto(createInventoryCountSchema) {}
class RecordInventoryCountItemDto extends createZodDto(recordInventoryCountItemSchema) {}

@ApiTags("inventory-counts")
@Controller("inventory-counts")
export class InventoryCountsController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @RequirePermissions("warehouse.write")
  @Post()
  async create(@Body() body: CreateInventoryCountDto): Promise<InventoryCountResponseDto> {
    const inventoryCount = await this.warehouseService.createInventoryCount(body);
    return inventoryCountResponseSchema.parse(inventoryCount);
  }

  @RequirePermissions("warehouse.write")
  @Post(":id/items")
  async recordItem(
    @Param("id") id: string,
    @Body() body: RecordInventoryCountItemDto,
  ): Promise<InventoryCountResponseDto> {
    const inventoryCount = await this.warehouseService.recordInventoryCountItem(id, body);
    return inventoryCountResponseSchema.parse(inventoryCount);
  }

  @RequirePermissions("warehouse.write")
  @Post(":id/complete")
  async complete(@Param("id") id: string): Promise<InventoryCountResponseDto> {
    const inventoryCount = await this.warehouseService.completeInventoryCount(id);
    return inventoryCountResponseSchema.parse(inventoryCount);
  }
}
