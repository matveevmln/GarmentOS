import type { BatchCardDto, ProductionOrderResponseDto, ProductVariantResponseDto } from "@garmentos/shared-types";

// Собирает BatchCardDto из «сырого» ProductionOrderResponseDto на клиенте —
// нужен там, где список партий смешивает разные модели (ProductionOrdersPage,
// Главная) и полноценный GET /products/:id/production (с точным порядком
// размеров из карточки конкретной модели) не подходит. Раскладка здесь не
// сортируется по product_sizes.sortOrder — размеры идут в порядке появления
// среди вариантов заказа; на карточке модели (`GET /products/:id/production`)
// раскладка точная, здесь — минимально достаточная для списка партий.
export function buildBatchCardFromOrder(
  order: ProductionOrderResponseDto,
  productName: string,
  workshopName: string,
  photoDocumentId: string | null,
  specNumber: number | null,
  variantsById: Map<string, ProductVariantResponseDto>,
): BatchCardDto {
  const colorOrder: string[] = [];
  const byColor = new Map<string, Map<string, number>>();
  for (const line of order.variants) {
    const variant = variantsById.get(line.productVariantId);
    if (!variant) continue;
    if (!byColor.has(variant.color)) {
      byColor.set(variant.color, new Map());
      colorOrder.push(variant.color);
    }
    const sizeMap = byColor.get(variant.color)!;
    sizeMap.set(variant.size, (sizeMap.get(variant.size) ?? 0) + Number(line.quantity));
  }

  const breakdown = colorOrder.map((color) => {
    const sizeMap = byColor.get(color)!;
    const sizes = [...sizeMap.entries()].map(([size, quantity]) => ({ size, quantity }));
    return { color, quantity: sizes.reduce((sum, row) => sum + row.quantity, 0), sizes };
  });

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    plannedQuantity: order.plannedQuantity,
    dueDate: order.dueDate,
    productId: order.productId,
    productName,
    photoDocumentId,
    workshopName,
    specificationId: order.specificationId,
    specNumber,
    breakdown,
  };
}
