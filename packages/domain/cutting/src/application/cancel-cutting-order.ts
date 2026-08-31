import { DomainError } from "../domain/errors";
import { assertCanCancel, type CuttingOrder } from "../domain/cutting-order";
import type { CuttingOrderRepository } from "./ports";

export interface CancelCuttingOrderInput {
  companyId: string;
  cuttingOrderId: string;
}

export interface CancelCuttingOrderDeps {
  cuttingOrders: CuttingOrderRepository;
}

// Отмена задания. Завершённое не отменяется: если факт внесён с ошибкой, его
// исправляют корректировкой, а не откатом всего задания (владелец проекта,
// 2026-08-30) — иначе исчезло бы и уже проведённое движение по складу.
export async function cancelCuttingOrder(
  deps: CancelCuttingOrderDeps,
  input: CancelCuttingOrderInput,
): Promise<CuttingOrder> {
  const order = await deps.cuttingOrders.findById(input.companyId, input.cuttingOrderId);
  if (!order) {
    throw new DomainError(`Раскройное задание ${input.cuttingOrderId} не найдено`, "CUTTING_ORDER_NOT_FOUND");
  }
  assertCanCancel(order.status);
  return deps.cuttingOrders.updateStatus(order.id, "cancelled", {});
}
