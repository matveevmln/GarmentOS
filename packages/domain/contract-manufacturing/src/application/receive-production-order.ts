import { DomainError } from "../domain/errors";
import {
  assertCanReceive,
  assertReceivedVariantsValid,
  type ProductionOrder,
  type ReceivedVariantInput,
} from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface ReceiveProductionOrderInput {
  companyId: string;
  productionOrderId: string;
  // Факт по варианту (P0-1). Строки заказа, отсутствующие здесь, принимаются
  // по плану (обратная совместимость — приёмка без явного факта работает как
  // раньше). Пустой массив/отсутствие поля — тот же случай "факт = план".
  receivedVariants?: ReceivedVariantInput[];
}

export interface ReceiveProductionOrderDeps {
  productionOrders: ProductionOrderRepository;
}

// Приёмка партии от цеха на наш склад (Итерация 10, факт — P0-1) — статус
// ready_for_pickup -> received. Фактическое зачисление на склад по каждому
// SKU (variants) — ответственность вызывающей стороны (apps/api), этот use
// case только переводит статус заказа и фиксирует факт по строкам, тот же
// принцип разделения границ, что и у receivePurchaseOrder в
// @garmentos/domain-procurement.
export async function receiveProductionOrder(
  deps: ReceiveProductionOrderDeps,
  input: ReceiveProductionOrderInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(
      `Заказ пошива ${input.productionOrderId} не найден в этой компании`,
      "PRODUCTION_ORDER_NOT_FOUND",
    );
  }
  assertCanReceive(order.status);

  const explicitlyReceived = input.receivedVariants ?? [];
  assertReceivedVariantsValid(order.variants, explicitlyReceived);
  const receivedByVariantId = new Map(explicitlyReceived.map((line) => [line.productVariantId, line.quantity]));

  // Строка без явного факта получает плановое количество — тот же результат,
  // что и до P0-1, для всех вызывающих, которые ещё не передают факт.
  const received: ReceivedVariantInput[] = order.variants.map((variant) => ({
    productVariantId: variant.productVariantId,
    quantity: receivedByVariantId.get(variant.productVariantId) ?? Number(variant.quantity),
  }));

  return deps.productionOrders.markReceived(order.id, received);
}
