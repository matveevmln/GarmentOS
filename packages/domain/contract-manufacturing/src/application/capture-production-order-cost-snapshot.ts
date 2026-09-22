import { DomainError } from "../domain/errors";
import { assertCostSnapshotNotYetSet, costSnapshotAlreadySetError, type ProductionOrder } from "../domain/production-order";
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

  // Идемпотентность/гонка (аудит 2026-09-22): проверка выше сама по себе не
  // атомарна с записью — если ровно в этот момент параллельный confirm того
  // же заказа уже прошёл ту же проверку и записал первым, репозиторий вернёт
  // null (его compare-and-swap на cost_snapshot IS NULL не найдёт ни одной
  // строки). С точки зрения вызывающего это неотличимо от обычной повторной
  // попытки — та же ошибка.
  const updated = await deps.productionOrders.updateCostSnapshot(order.id, input.costSnapshot);
  if (!updated) {
    throw costSnapshotAlreadySetError();
  }
  return updated;
}
