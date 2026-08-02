import { DomainError } from "./errors";

export type ShipmentStatus = "planned" | "in_transit" | "customs_clearance" | "delivered" | "cancelled";

export interface ShipmentItem {
  id: string;
  shipmentId: string;
  productVariantId: string;
  quantity: string;
  createdAt: Date;
  updatedAt: Date;
}

// Отгрузка/экспорт между СВОИМИ складами (не продажа покупателю — см.
// CLAUDE.md, глоссарий: shipment ≠ dispatch). Простая сущность, не полноценный
// таможенный модуль (docs/DATABASE_SCHEMA.md, раздел 10).
export interface Shipment {
  id: string;
  companyId: string;
  originWarehouseId: string;
  destinationWarehouseId: string;
  carrierId: string | null;
  status: ShipmentStatus;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: ShipmentItem[];
}

export interface ShipmentItemDraft {
  productVariantId: string;
  quantity: number;
}

export function assertHasItems(items: ShipmentItemDraft[]): void {
  if (items.length === 0) {
    throw new DomainError("Отгрузка должна содержать хотя бы одну позицию SKU", "SHIPMENT_EMPTY");
  }
}

export function assertDifferentWarehouses(originWarehouseId: string, destinationWarehouseId: string): void {
  if (originWarehouseId === destinationWarehouseId) {
    throw new DomainError(
      "Склад отправления и склад назначения не могут совпадать",
      "SHIPMENT_SAME_WAREHOUSE",
    );
  }
}

export function assertCanMarkDelivered(status: ShipmentStatus): void {
  if (status === "delivered" || status === "cancelled") {
    throw new DomainError(
      `Нельзя отметить доставленной отгрузку в статусе "${status}"`,
      "SHIPMENT_ALREADY_FINAL",
    );
  }
}
