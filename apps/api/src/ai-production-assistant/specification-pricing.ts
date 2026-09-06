// Цена и сумма одной строки спецификации (P5-2, владелец проекта,
// 2026-09-06). Вынесено в чистую функцию из generateAndSendSpecification,
// чтобы правило "rework всегда бесплатен, new — по цене строки или, если не
// задана, по цене заказа" было проверяемо напрямую unit-тестом, без БД и без
// генерации PDF. Для заказа без rework-строк (unitPrice === null у всех)
// результат идентичен старой формуле `agreedUnitPrice × quantity`.
export function computeSpecificationLinePricing(
  order: { agreedUnitPrice: string },
  variant: { variantType: "new" | "rework"; unitPrice: string | null; quantity: string },
): { quantity: number; unitPrice: number; sum: number } {
  const unitPrice =
    variant.variantType === "rework"
      ? 0
      : variant.unitPrice !== null
        ? Number(variant.unitPrice)
        : Number(order.agreedUnitPrice);
  const quantity = Number(variant.quantity);
  return { quantity, unitPrice, sum: quantity * unitPrice };
}
