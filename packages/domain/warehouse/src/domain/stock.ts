import { DomainError } from "./errors";

export type StockMovementType = "receipt" | "dispatch" | "adjustment" | "transfer";

// Остаток SKU на конкретном складе (docs/DATABASE_SCHEMA.md, раздел 9).
// quantityOnHand — денормализованный текущий остаток; источник истины —
// stockMovements (append-only), см. PRINCIPLES.md принцип 12.
export interface StockItem {
  id: string;
  warehouseId: string;
  productVariantId: string;
  quantityOnHand: string;
  quantityReserved: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StockMovement {
  id: string;
  stockItemId: string;
  type: StockMovementType;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: Date;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function parseQuantity(value: string): number {
  return Number(value);
}

export function assertPositiveQuantity(quantity: number, field = "Количество"): void {
  if (quantity <= 0) {
    throw new DomainError(`${field} должно быть положительным (получено ${quantity})`, "STOCK_QUANTITY_INVALID");
  }
}

// Ключевой инвариант из USER_JOURNEY_AUDIT.md, зафиксированный в ROADMAP.md
// (Итерация 3): запрет dispatch/transfer при недостатке остатка. Доступно
// для списания — то, что физически на складе и не зарезервировано другим
// процессом.
export function assertSufficientAvailable(onHand: number, reserved: number, requested: number): void {
  const available = onHand - reserved;
  if (available < requested) {
    throw new DomainError(
      `Недостаточно остатка: доступно ${available} (на складе ${onHand}, зарезервировано ${reserved}), запрошено ${requested}`,
      "STOCK_INSUFFICIENT",
    );
  }
}

export function assertSufficientReserved(reserved: number, requested: number): void {
  if (reserved < requested) {
    throw new DomainError(
      `Нельзя снять резерв ${requested} — сейчас зарезервировано только ${reserved}`,
      "STOCK_RESERVATION_INSUFFICIENT",
    );
  }
}
