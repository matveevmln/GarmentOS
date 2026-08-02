import { DomainError } from "./errors";

export type PurchaseOrderStatus = "draft" | "sent" | "partially_received" | "received" | "cancelled";

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  materialId: string;
  quantity: string;
  unitPrice: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseOrder {
  id: string;
  companyId: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  orderedAt: string;
  expectedDate: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderItemDraft {
  materialId: string;
  quantity: number;
  unitPrice: number;
}

// Инвариант: закупка не может быть создана без хотя бы одной строки
// (docs/DATABASE_SCHEMA.md, раздел 6) — заказ на "ничего" бессмыслен.
export function assertHasItems(items: PurchaseOrderItemDraft[]): void {
  if (items.length === 0) {
    throw new DomainError("Закупка должна содержать хотя бы одну позицию материала", "PURCHASE_ORDER_EMPTY");
  }
}

export function assertValidItem(item: PurchaseOrderItemDraft): void {
  if (item.quantity <= 0) {
    throw new DomainError(
      `Количество материала должно быть положительным (получено ${item.quantity})`,
      "PURCHASE_ORDER_ITEM_QUANTITY_INVALID",
    );
  }
  if (item.unitPrice < 0) {
    throw new DomainError(
      `Цена за единицу не может быть отрицательной (получено ${item.unitPrice})`,
      "PURCHASE_ORDER_ITEM_PRICE_INVALID",
    );
  }
}

// Инвариант: подтвердить (отправить поставщику) можно только черновик —
// повторное подтверждение или подтверждение отменённого заказа запрещено.
export function assertCanConfirm(status: PurchaseOrderStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Нельзя подтвердить закупку в статусе "${status}" — подтверждение доступно только для черновика`,
      "PURCHASE_ORDER_NOT_DRAFT",
    );
  }
}

// Приёмка материала возможна только после отправки поставщику — нельзя
// принять то, что ещё не заказано, и нельзя принять отменённый заказ
// (владелец проекта, 2026-08-02: остатки материалов должны появляться из
// реальной приёмки закупки, а не из воздуха).
export function assertCanReceive(status: PurchaseOrderStatus): void {
  if (status !== "sent" && status !== "partially_received") {
    throw new DomainError(
      `Нельзя принять закупку в статусе "${status}" — приёмка доступна только после отправки поставщику`,
      "PURCHASE_ORDER_NOT_RECEIVABLE",
    );
  }
}
