import { DomainError } from "../domain/errors";
import { assertCanConfirm, type PurchaseOrder } from "../domain/purchase-order";
import type { PurchaseOrderRepository } from "./ports";

export interface ConfirmPurchaseOrderInput {
  companyId: string;
  purchaseOrderId: string;
}

export interface ConfirmPurchaseOrderDeps {
  purchaseOrders: PurchaseOrderRepository;
}

// Подтверждение черновика закупки — заказ считается отправленным поставщику
// (status: draft -> sent). Это шаг, который человек (или AI после
// one-tap-подтверждения предложения Inbox) выполняет поверх черновика,
// созданного createPurchaseOrderDraft — draft остаётся безопасным до этого
// момента (docs/PRINCIPLES.md, разделы про draft-first).
export async function confirmPurchaseOrder(
  deps: ConfirmPurchaseOrderDeps,
  input: ConfirmPurchaseOrderInput,
): Promise<PurchaseOrder> {
  const order = await deps.purchaseOrders.findById(input.companyId, input.purchaseOrderId);
  if (!order) {
    throw new DomainError(`Закупка ${input.purchaseOrderId} не найдена в этой компании`, "PURCHASE_ORDER_NOT_FOUND");
  }
  assertCanConfirm(order.status);

  return deps.purchaseOrders.updateStatus(order.id, "sent");
}
