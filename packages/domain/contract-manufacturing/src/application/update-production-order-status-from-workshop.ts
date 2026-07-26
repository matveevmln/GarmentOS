import { DomainError } from "../domain/errors";
import { assertCanUpdateStatusFromWorkshop, type ProductionOrder } from "../domain/production-order";
import type { ProductionOrderRepository } from "./ports";

export interface UpdateProductionOrderStatusFromWorkshopInput {
  companyId: string;
  workshopId: string;
  status: "in_progress" | "ready_for_pickup";
}

export interface UpdateProductionOrderStatusFromWorkshopDeps {
  productionOrders: ProductionOrderRepository;
}

// Простой входящий ответ цеха в Telegram → обновление статуса заказа
// (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 4; Итерация 7). Цех не
// указывает id заказа — сообщение относится к самому свежему незавершённому
// заказу этого цеха (см. комментарий на ProductionOrderRepository.findLatestActiveByWorkshop).
export async function updateProductionOrderStatusFromWorkshop(
  deps: UpdateProductionOrderStatusFromWorkshopDeps,
  input: UpdateProductionOrderStatusFromWorkshopInput,
): Promise<ProductionOrder> {
  const order = await deps.productionOrders.findLatestActiveByWorkshop(input.companyId, input.workshopId);
  if (!order) {
    throw new DomainError(
      `У цеха ${input.workshopId} нет активных заказов пошива для обновления статуса`,
      "PRODUCTION_ORDER_NOT_FOUND",
    );
  }
  assertCanUpdateStatusFromWorkshop(order.status, input.status);

  return deps.productionOrders.updateStatus(order.id, input.status);
}
