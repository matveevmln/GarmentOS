import { orders, orderItems, salesChannels, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { SalesChannel } from "../domain/sales-channel";
import type { Order, OrderItem, OrderStatus } from "../domain/order";
import type { NewOrderInput, NewSalesChannelInput, OrderRepository, SalesChannelRepository } from "../application/ports";

type SalesChannelRow = typeof salesChannels.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

function toSalesChannel(row: SalesChannelRow): SalesChannel {
  return {
    id: row.id,
    companyId: row.companyId,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.orderId,
    productVariantId: row.productVariantId,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOrder(row: OrderRow, items: OrderItemRow[]): Order {
  return {
    id: row.id,
    companyId: row.companyId,
    salesChannelId: row.salesChannelId,
    externalOrderId: row.externalOrderId,
    status: row.status,
    totalAmount: row.totalAmount,
    orderedAt: row.orderedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map(toOrderItem),
  };
}

export class DrizzleSalesChannelRepository implements SalesChannelRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewSalesChannelInput): Promise<SalesChannel> {
    const [row] = await this.db.insert(salesChannels).values(input).returning();
    if (!row) throw new Error("INSERT sales_channels не вернул строку");
    return toSalesChannel(row);
  }

  async findById(companyId: string, id: string): Promise<SalesChannel | null> {
    const [row] = await this.db
      .select()
      .from(salesChannels)
      .where(and(eq(salesChannels.companyId, companyId), eq(salesChannels.id, id)))
      .limit(1);
    return row ? toSalesChannel(row) : null;
  }
}

export class DrizzleOrderRepository implements OrderRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewOrderInput): Promise<Order> {
    return this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(orders)
        .values({
          companyId: input.companyId,
          salesChannelId: input.salesChannelId,
          externalOrderId: input.externalOrderId,
          status: input.status,
          totalAmount: String(input.totalAmount),
          orderedAt: input.orderedAt,
        })
        .returning();
      if (!orderRow) throw new Error("INSERT orders не вернул строку");

      const itemRows = await tx
        .insert(orderItems)
        .values(
          input.items.map((item) => ({
            orderId: orderRow.id,
            productVariantId: item.productVariantId,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
          })),
        )
        .returning();

      return toOrder(orderRow, itemRows);
    });
  }

  async findById(companyId: string, id: string): Promise<Order | null> {
    const [orderRow] = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.companyId, companyId), eq(orders.id, id)))
      .limit(1);
    if (!orderRow) return null;

    const itemRows = await this.db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
    return toOrder(orderRow, itemRows);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    const [orderRow] = await this.db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    if (!orderRow) throw new Error(`UPDATE orders не нашёл строку id=${id}`);

    const itemRows = await this.db.select().from(orderItems).where(eq(orderItems.orderId, orderRow.id));
    return toOrder(orderRow, itemRows);
  }
}
