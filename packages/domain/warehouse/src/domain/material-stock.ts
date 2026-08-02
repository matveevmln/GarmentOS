import { DomainError } from "./errors";

export type MaterialStockMovementType = "receipt" | "consumption" | "adjustment";

// Остаток материала (ткань/фурнитура/упаковка) на конкретном складе — тот же
// принцип, что и StockItem для готовых SKU (packages/domain/warehouse/src/domain/stock.ts),
// но для сырья (владелец проекта, 2026-08-02: "проверить наличие ткани и
// фурнитуры" — до этой правки остатки материалов нигде не отслеживались).
// quantityOnHand — денормализованный текущий остаток; источник истины —
// materialStockMovements (append-only), см. PRINCIPLES.md принцип 12.
export interface MaterialStockItem {
  id: string;
  warehouseId: string;
  materialId: string;
  quantityOnHand: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialStockMovement {
  id: string;
  materialStockItemId: string;
  type: MaterialStockMovementType;
  quantity: string;
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: Date;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function parseMaterialQuantity(value: string): number {
  return Number(value);
}

export function assertPositiveMaterialQuantity(quantity: number, field = "Количество"): void {
  if (quantity <= 0) {
    throw new DomainError(`${field} должно быть положительным (получено ${quantity})`, "MATERIAL_STOCK_QUANTITY_INVALID");
  }
}

// Материалы не резервируются отдельно (в отличие от готовых SKU) — на этапе
// MVP достаточно сравнения с фактическим остатком на складе.
export function assertSufficientMaterialAvailable(onHand: number, requested: number): void {
  if (onHand < requested) {
    throw new DomainError(
      `Недостаточно остатка материала: на складе ${onHand}, требуется ${requested}`,
      "MATERIAL_STOCK_INSUFFICIENT",
    );
  }
}
