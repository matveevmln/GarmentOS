import { DomainError } from "./errors";
import type { ProductionOrder } from "./production-order";

export function validateReceiptCorrection(
  order: ProductionOrder,
  expected: Array<{ productVariantId: string; quantity: number }>,
  next: Array<{ productVariantId: string; quantity: number }>,
) {
  if (
    !["received", "completed"].includes(order.status) ||
    order.variants.some((v) => v.receivedQuantity === null)
  )
    throw new DomainError("Исправление доступно после записанной приёмки", "RECEIPT_NOT_RECORDED");
  const ids = new Set(order.variants.map((v) => v.productVariantId));
  const complete = (rows: typeof next) =>
    rows.length === ids.size &&
    new Set(rows.map((r) => r.productVariantId)).size === ids.size &&
    rows.every(
      (r) => ids.has(r.productVariantId) && Number.isSafeInteger(r.quantity) && r.quantity >= 0,
    );
  if (ids.size !== order.variants.length || !complete(next) || !complete(expected))
    throw new DomainError(
      "Укажите каждый размер и цвет партии ровно один раз",
      "RECEIPT_VARIANTS_INVALID",
    );
  const before = new Map(expected.map((r) => [r.productVariantId, r.quantity]));
  if (order.variants.some((v) => before.get(v.productVariantId) !== Number(v.receivedQuantity)))
    throw new DomainError(
      "Приёмка уже изменена. Обновите страницу и проверьте количества",
      "RECEIPT_CHANGED",
    );
  if (next.every((r) => before.get(r.productVariantId) === r.quantity))
    throw new DomainError("Количество не изменилось", "RECEIPT_UNCHANGED");
}
