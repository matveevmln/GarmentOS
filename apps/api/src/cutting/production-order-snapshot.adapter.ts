import { Injectable } from "@nestjs/common";
import type { ProductionOrderSnapshotPort } from "@garmentos/domain-cutting";
import type { ProductionOrderCostSnapshot } from "@garmentos/shared-types";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";

// Адаптер порта: раскрой не читает таблицы заказа напрямую
// (docs/PRINCIPLES.md, принцип 2). Отдаёт ровно то, что нужно раскрою —
// матрицу размер×цвет и замороженные нормы, — и ничего больше.
@Injectable()
export class ProductionOrderSnapshotAdapter implements ProductionOrderSnapshotPort {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  async findForCutting(companyId: string, productionOrderId: string) {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    if (!order) return null;

    const snapshot = order.costSnapshot as ProductionOrderCostSnapshot | null;
    return {
      status: order.status,
      plannedQuantity: Number(order.plannedQuantity),
      variants: order.variants.map((variant) => ({
        productVariantId: variant.productVariantId,
        quantity: Number(variant.quantity),
      })),
      // Нормы берутся ТОЛЬКО из снимка партии: подставлять сегодняшние нормы
      // модели нельзя — старая партия не должна пересчитываться задним числом.
      materialNorms: (snapshot?.materialNorms ?? []).map((norm) => ({
        materialId: norm.materialId,
        unit: norm.unit,
        quantityPerUnit: norm.quantityPerUnit,
        wastePercent: norm.wastePercent,
      })),
    };
  }
}
