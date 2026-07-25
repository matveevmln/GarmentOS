import { DomainError } from "../domain/errors";
import { assertHasItems, assertValidItem, type Order, type OrderItemDraft } from "../domain/order";
import type { OrderRepository, SalesChannelRepository } from "./ports";

export interface CreateOrderInput {
  companyId: string;
  salesChannelId: string;
  items: OrderItemDraft[];
  externalOrderId?: string;
  orderedAt?: Date;
}

export interface CreateOrderDeps {
  orders: OrderRepository;
  salesChannels: SalesChannelRepository;
}

// Единая точка входа заказа независимо от канала (маркетплейс/опт/розница/
// свой сайт) — docs/DATABASE_SCHEMA.md, раздел 11. totalAmount считается из
// позиций, а не вводится отдельно (принцип 12, PRINCIPLES.md — производные
// данные не хранятся независимо от первичных).
export async function createOrder(deps: CreateOrderDeps, input: CreateOrderInput): Promise<Order> {
  assertHasItems(input.items);
  for (const item of input.items) assertValidItem(item);

  const channel = await deps.salesChannels.findById(input.companyId, input.salesChannelId);
  if (!channel) {
    throw new DomainError(`Канал продаж ${input.salesChannelId} не найден в этой компании`, "SALES_CHANNEL_NOT_FOUND");
  }

  const totalAmount = input.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return deps.orders.create({
    companyId: input.companyId,
    salesChannelId: input.salesChannelId,
    externalOrderId: input.externalOrderId ?? null,
    status: "new",
    totalAmount,
    orderedAt: input.orderedAt ?? new Date(),
    items: input.items,
  });
}
