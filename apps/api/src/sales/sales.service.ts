import { Inject, Injectable } from "@nestjs/common";
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  createSalesChannel,
  deliverOrder,
  shipOrder,
  type Order,
  type OrderRepository,
  type SalesChannel,
  type SalesChannelRepository,
} from "@garmentos/domain-sales";
import type { CreateOrderDto, CreateSalesChannelDto } from "@garmentos/shared-types";
import { ORDER_REPOSITORY, SALES_CHANNEL_REPOSITORY } from "./sales.tokens";

// Тонкий presentation-адаптер поверх packages/domain/sales
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в остальных модулях.
@Injectable()
export class SalesService {
  constructor(
    @Inject(SALES_CHANNEL_REPOSITORY) private readonly salesChannels: SalesChannelRepository,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
  ) {}

  async createSalesChannel(input: CreateSalesChannelDto): Promise<SalesChannel> {
    return createSalesChannel({ salesChannels: this.salesChannels }, input);
  }

  async createOrder(input: CreateOrderDto): Promise<Order> {
    // orderedAt — ISO-строка в DTO (Swagger/zod v4 не представляют Date в
    // JSON Schema, packages/shared-types/src/sales/schemas.ts), домен
    // ожидает Date — приведение здесь, на границе presentation/domain.
    return createOrder(
      { orders: this.orders, salesChannels: this.salesChannels },
      { ...input, orderedAt: input.orderedAt ? new Date(input.orderedAt) : undefined },
    );
  }

  async confirmOrder(companyId: string, orderId: string): Promise<Order> {
    return confirmOrder({ orders: this.orders }, { companyId, orderId });
  }

  async shipOrder(companyId: string, orderId: string): Promise<Order> {
    return shipOrder({ orders: this.orders }, { companyId, orderId });
  }

  async deliverOrder(companyId: string, orderId: string): Promise<Order> {
    return deliverOrder({ orders: this.orders }, { companyId, orderId });
  }

  async cancelOrder(companyId: string, orderId: string): Promise<Order> {
    return cancelOrder({ orders: this.orders }, { companyId, orderId });
  }
}
