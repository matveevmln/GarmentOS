import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  dispatchStockSchema,
  receiveStockSchema,
  stockItemResponseSchema,
  stockReservationSchema,
  transferStockResponseSchema,
  transferStockSchema,
  type StockItemResponseDto,
  type TransferStockResponseDto,
} from "@garmentos/shared-types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { WarehouseService } from "./warehouse.service";

class ReceiveStockDto extends createZodDto(receiveStockSchema) {}
class DispatchStockDto extends createZodDto(dispatchStockSchema) {}
class TransferStockDto extends createZodDto(transferStockSchema) {}
class StockReservationDto extends createZodDto(stockReservationSchema) {}

@ApiTags("stock")
@Controller("stock")
export class StockController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @RequirePermissions("warehouse.write")
  @Post("receive")
  async receive(@Body() body: ReceiveStockDto): Promise<StockItemResponseDto> {
    const stockItem = await this.warehouseService.receiveStock(body);
    return stockItemResponseSchema.parse(stockItem);
  }

  @RequirePermissions("warehouse.write")
  @Post("dispatch")
  async dispatch(@Body() body: DispatchStockDto): Promise<StockItemResponseDto> {
    const stockItem = await this.warehouseService.dispatchStock(body);
    return stockItemResponseSchema.parse(stockItem);
  }

  @RequirePermissions("warehouse.write")
  @Post("transfer")
  async transfer(@Body() body: TransferStockDto): Promise<TransferStockResponseDto> {
    const result = await this.warehouseService.transferStock(body);
    return transferStockResponseSchema.parse(result);
  }

  @RequirePermissions("warehouse.write")
  @Post("reserve")
  async reserve(@Body() body: StockReservationDto): Promise<StockItemResponseDto> {
    const stockItem = await this.warehouseService.reserveStock(body);
    return stockItemResponseSchema.parse(stockItem);
  }

  @RequirePermissions("warehouse.write")
  @Post("release")
  async release(@Body() body: StockReservationDto): Promise<StockItemResponseDto> {
    const stockItem = await this.warehouseService.releaseReservation(body);
    return stockItemResponseSchema.parse(stockItem);
  }
}
