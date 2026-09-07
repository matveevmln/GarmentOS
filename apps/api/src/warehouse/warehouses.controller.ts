import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createWarehouseSchema,
  materialStockItemResponseSchema,
  warehouseResponseSchema,
  type MaterialStockItemResponseDto,
  type WarehouseResponseDto,
} from "@garmentos/shared-types";
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

  @RequirePermissions("warehouse.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<WarehouseResponseDto[]> {
    const warehouses = await this.warehouseService.listWarehouses(currentUser.companyId);
    return warehouses.map((warehouse) => warehouseResponseSchema.parse(warehouse));
  }

  // Остаток материалов по складу (P0-3, владелец проекта, 2026-09-07) —
  // раньше остаток можно было узнать только прямым запросом к БД.
  @RequirePermissions("warehouse.read")
  @Get(":id/material-stock")
  async materialStock(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MaterialStockItemResponseDto[]> {
    const items = await this.warehouseService.listMaterialStock(currentUser.companyId, id);
    return items.map((item) => materialStockItemResponseSchema.parse(item));
  }
}
