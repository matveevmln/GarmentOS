import { DomainError } from "../domain/errors";
import { assertValidTransition, type Order, type OrderStatus } from "../domain/order";
import type { OrderRepository } from "./ports";

export interface TransitionOrderStatusInput {
  companyId: string;
  orderId: string;
}

export interface TransitionOrderStatusDeps {
  orders: OrderRepository;
}

async function transition(
  deps: TransitionOrderStatusDeps,
  input: TransitionOrderStatusInput,
  to: OrderStatus,
): Promise<Order> {
  const order = await deps.orders.findById(input.companyId, input.orderId);
  if (!order) {
    throw new DomainError(`Заказ ${input.orderId} не найден в этой компании`, "ORDER_NOT_FOUND");
  }
  assertValidTransition(order.status, to);

  return deps.orders.updateStatus(order.id, to);
}

export const confirmOrder = (deps: TransitionOrderStatusDeps, input: TransitionOrderStatusInput) =>
  transition(deps, input, "confirmed");

export const shipOrder = (deps: TransitionOrderStatusDeps, input: TransitionOrderStatusInput) =>
  transition(deps, input, "shipped");

export const deliverOrder = (deps: TransitionOrderStatusDeps, input: TransitionOrderStatusInput) =>
  transition(deps, input, "delivered");

export const cancelOrder = (deps: TransitionOrderStatusDeps, input: TransitionOrderStatusInput) =>
  transition(deps, input, "cancelled");
