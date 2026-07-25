import { DomainError } from "./errors";

export type OrderStatus = "new" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned";

export interface OrderItem {
  id: string;
  orderId: string;
  productVariantId: string;
  quantity: string;
  unitPrice: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  companyId: string;
  salesChannelId: string;
  externalOrderId: string | null;
  status: OrderStatus;
  totalAmount: string;
  orderedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItem[];
}

export interface OrderItemDraft {
  productVariantId: string;
  quantity: number;
  unitPrice: number;
}

export function assertHasItems(items: OrderItemDraft[]): void {
  if (items.length === 0) {
    throw new DomainError("Заказ должен содержать хотя бы одну позицию", "ORDER_EMPTY");
  }
}

export function assertValidItem(item: OrderItemDraft): void {
  if (item.quantity <= 0) {
    throw new DomainError(`Количество должно быть положительным (получено ${item.quantity})`, "ORDER_ITEM_QUANTITY_INVALID");
  }
  if (item.unitPrice < 0) {
    throw new DomainError(
      `Цена за единицу не может быть отрицательной (получено ${item.unitPrice})`,
      "ORDER_ITEM_PRICE_INVALID",
    );
  }
}

// Разрешённые переходы статуса заказа (docs/DATABASE_SCHEMA.md, раздел 11).
// `returned` — отдельная ветка (после delivered), намеренно не покрыта use
// case в этой партии — возвраты полноценно моделируются в Фазе 2 вместе с
// обработкой кодов маркировки при возврате (docs/ROADMAP.md, Фаза 2).
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  returned: [],
};

export function assertValidTransition(from: OrderStatus, to: OrderStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      `Недопустимый переход статуса заказа: "${from}" → "${to}"`,
      "ORDER_INVALID_STATUS_TRANSITION",
    );
  }
}
