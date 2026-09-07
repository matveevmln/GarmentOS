// Минимальная структурная форма — не конкретный DTO, чтобы функция подходила
// и ProductionOrderResponseDto (список заказов), и BatchPassportResponseDto
// (паспорт партии): оба содержат нужные поля, но разными объектами.
interface ProductionOrderPricingShape {
  agreedUnitPrice: string;
  variants: Array<{ quantity: string; variantType: "new" | "rework"; unitPrice: string | null }>;
}

/**
 * Сумма партии — по строкам (P5-2, владелец проекта, 2026-09-06). Смешанный
 * заказ может одновременно содержать бесплатные rework-строки (переделка
 * брака цехом за свой счёт) и обычные new-строки с ценой — старая формула
 * `agreedUnitPrice × plannedQuantity` для такого заказа завышала сумму,
 * начисляя цену и за переделку.
 *
 * Для заказа без rework-строк результат не меняется ни на копейку: у всех
 * строк unitPrice === null, поэтому используется agreedUnitPrice, а сумма
 * количеств строк равна plannedQuantity (гарантируется доменным инвариантом
 * assertVariantsMatchPlannedQuantity) — то есть Σ(quantity × agreedUnitPrice)
 * = plannedQuantity × agreedUnitPrice, как и раньше.
 */
export function computeProductionOrderBatchSum(order: ProductionOrderPricingShape): number {
  const orderUnitPrice = Number(order.agreedUnitPrice);
  return order.variants.reduce((sum, variant) => {
    const unitPrice =
      variant.variantType === "rework" ? 0 : variant.unitPrice !== null ? Number(variant.unitPrice) : orderUnitPrice;
    return sum + Number(variant.quantity) * unitPrice;
  }, 0);
}

/**
 * Факт приёмки суммарно по партии (P1, hardening перед «Стеганкой», владелец
 * проекта, 2026-09-07) — единственный законный источник значения "Получено"
 * для ОТК: план (plannedQuantity/quantity) никогда не подставляется вместо
 * факта ("ordered ≠ received"). null означает, что факт неизвестен хотя бы по
 * одной строке — например, заказ был принят до появления поля
 * receivedQuantity (P0-1); в этом случае вызывающая сторона обязана честно
 * показать "факт неизвестен", а не молча взять план.
 */
export function computeTotalReceivedQuantity(order: {
  variants: Array<{ receivedQuantity: string | null }>;
}): number | null {
  if (order.variants.length === 0) return null;
  if (order.variants.some((variant) => variant.receivedQuantity === null)) return null;
  return order.variants.reduce((sum, variant) => sum + Number(variant.receivedQuantity), 0);
}
