import { Injectable } from "@nestjs/common";
import type { MaterialStockPort } from "@garmentos/domain-cutting";
import { WarehouseService } from "../warehouse/warehouse.service";

// Адаптер порта склада для раскроя. Второй системы учёта не заводится —
// используются те же material_stock_items/material_stock_movements, что и
// приёмка закупки; отличается только тип движения и ссылка на источник.
@Injectable()
export class CuttingMaterialStockAdapter implements MaterialStockPort {
  constructor(private readonly warehouseService: WarehouseService) {}

  async quantityOnHand(warehouseId: string, materialId: string): Promise<number> {
    const item = await this.warehouseService.findMaterialStockItem(warehouseId, materialId);
    return item ? Number(item.quantityOnHand) : 0;
  }

  async consume(
    warehouseId: string,
    materialId: string,
    quantity: number,
    meta: { referenceType: string; referenceId: string; createdBy: string | null },
  ): Promise<void> {
    // allowOverdraft=true: факт кроя не блокируется состоянием учёта
    // (владелец проекта, 2026-08-30).
    await this.warehouseService.consumeMaterialStock(warehouseId, materialId, quantity, meta, true);
  }

  // Возврат материала на склад после кроя (Этап 3) — тот же механизм, что и
  // приёмка закупки (material_stock_items/material_stock_movements), только
  // с referenceType='cutting_order_return' для истории движений. Без
  // currentUser/аудита внутри — тот же принцип, что у consume()/adjust()
  // выше: аудит-запись "cutting_order.fact_recorded" уже пишет
  // CuttingService целиком, включая возврат по каждому материалу.
  async receive(
    warehouseId: string,
    materialId: string,
    quantity: number,
    meta: { referenceType: string; referenceId: string; createdBy: string | null },
  ): Promise<void> {
    await this.warehouseService.receiveMaterialStockInternal(warehouseId, materialId, quantity, meta);
  }

  async adjust(
    warehouseId: string,
    materialId: string,
    delta: number,
    meta: { referenceType: string; referenceId: string; createdBy: string | null },
  ): Promise<void> {
    await this.warehouseService.adjustMaterialStock(warehouseId, materialId, delta, meta);
  }
}
