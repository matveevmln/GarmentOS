// Публичный интерфейс модуля Sales & Orders (docs/REPOSITORY_STRUCTURE.md).

export type { SalesChannel, SalesChannelType } from "./domain/sales-channel";
export type { Order, OrderItem, OrderItemDraft, OrderStatus } from "./domain/order";
export { DomainError } from "./domain/errors";

export type { NewOrderInput, NewSalesChannelInput, OrderRepository, SalesChannelRepository } from "./application/ports";
export {
  createSalesChannel,
  type CreateSalesChannelDeps,
  type CreateSalesChannelInput,
} from "./application/create-sales-channel";
export { createOrder, type CreateOrderDeps, type CreateOrderInput } from "./application/create-order";
export {
  cancelOrder,
  confirmOrder,
  deliverOrder,
  shipOrder,
  type TransitionOrderStatusDeps,
  type TransitionOrderStatusInput,
} from "./application/transition-order-status";

export { DrizzleOrderRepository, DrizzleSalesChannelRepository } from "./infrastructure/drizzle-sales-repository";
