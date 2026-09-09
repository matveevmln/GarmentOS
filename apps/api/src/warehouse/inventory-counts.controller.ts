import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createInventoryCountSchema,
  inventoryCountResponseSchema,
  recordInventoryCountItemSchema,
  type InventoryCountResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { WarehouseService } from "./warehouse.service";

class CreateInventoryCountDto extends createZodDto(createInventoryCountSchema) {}
class RecordInventoryCountItemDto extends createZodDto(recordInventoryCountItemSchema) {}

@ApiTags("inventory-counts")
@Controller("inventory-counts")
export class InventoryCountsController {
  constructor(private readonly warehouseService: WarehouseService) {}

  // warehouseId и :id приходят от клиента, поэтому companyId берётся из
  // токена и проверяется доменным слоем (Step 4A.2).
  @RequirePermissions("warehouse.write")
  @Post()
  async create(
    @Body() body: CreateInventoryCountDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InventoryCountResponseDto> {
    const inventoryCount = await this.warehouseService.createInventoryCount(currentUser.companyId, body);
    return inventoryCountResponseSchema.parse(inventoryCount);
  }

  @RequirePermissions("warehouse.write")
  @Post(":id/items")
  async recordItem(
    @Param("id") id: string,
    @Body() body: RecordInventoryCountItemDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InventoryCountResponseDto> {
    const inventoryCount = await this.warehouseService.recordInventoryCountItem(currentUser.companyId, id, body);
    return inventoryCountResponseSchema.parse(inventoryCount);
  }

  @RequirePermissions("warehouse.write")
  @Post(":id/complete")
  async complete(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<InventoryCountResponseDto> {
    const inventoryCount = await this.warehouseService.completeInventoryCount(currentUser.companyId, id);
    return inventoryCountResponseSchema.parse(inventoryCount);
  }
}
