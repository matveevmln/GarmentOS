import { DomainError } from "../domain/errors";
import { assertCostSnapshotNotYetSet, type ProductionOrder } from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface CaptureProductionOrderCostSnapshotInput {
  companyId: string;
  productionOrderId: string;
  costSnapshot: Record<string, unknown>;
}

export interface CaptureProductionOrderCostSnapshotDeps {
  productionOrders: ProductionOrderRepository;
}

// Единственная точка записи Snapshot партии (P1-1, владелец проекта,
// 2026-09-05). Раньше `updateCostSnapshot` вызывался напрямую на репозитории —
// техническая возможность перезаписать существующий снимок ничем не была
// перекрыта, кроме комментария "перезаписывать не предполагается". Теперь это
// проверяется явно: если у заказа уже есть снимок, повторная попытка
// зафиксировать его — ошибка, а не тихая перезапись.
export async function captureProductionOrderCostSnapshot(
  deps: CaptureProductionOrderCostSnapshotDeps,
  input: CaptureProductionOrderCostSnapshotInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(`Заказ пошива ${input.productionOrderId} не найден`, "PRODUCTION_ORDER_NOT_FOUND");
  }
  assertCostSnapshotNotYetSet(order.costSnapshot);

  return deps.productionOrders.updateCostSnapshot(order.id, input.costSnapshot);
}
