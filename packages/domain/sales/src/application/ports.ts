import type { SalesChannel, SalesChannelType } from "../domain/sales-channel";
import type { Order, OrderItemDraft, OrderStatus } from "../domain/order";

export interface NewSalesChannelInput {
  companyId: string;
  type: SalesChannelType;
  name: string;
}

export interface SalesChannelRepository {
  create(input: NewSalesChannelInput): Promise<SalesChannel>;
  findById(companyId: string, id: string): Promise<SalesChannel | null>;
}

export interface NewOrderInput {
  companyId: string;
  salesChannelId: string;
  externalOrderId: string | null;
  status: OrderStatus;
  totalAmount: number;
  orderedAt: Date;
  items: OrderItemDraft[];
}

export interface OrderRepository {
  create(input: NewOrderInput): Promise<Order>;
  findById(companyId: string, id: string): Promise<Order | null>;
  updateStatus(id: string, status: OrderStatus): Promise<Order>;
}
