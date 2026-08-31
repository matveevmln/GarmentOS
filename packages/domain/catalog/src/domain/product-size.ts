import { DomainError } from "./errors";

// Размерный ряд модели: порядок размеров и веса раскладки (владелец проекта,
// 2026-08-30). Вес — рабочее число, а не процент: «185 / 381 / 381 / 381 / 186»
// вводится как есть, система масштабирует его на любой объём заказа.
export interface ProductSize {
  id: string;
  productId: string;
  size: string;
  sortOrder: number;
  ratioWeight: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductSizeDraft {
  size: string;
  ratioWeight: number;
}

export function assertValidSizeRatios(sizes: ProductSizeDraft[]): void {
  if (sizes.length === 0) {
    throw new DomainError("Размерный ряд должен содержать хотя бы один размер", "PRODUCT_SIZES_EMPTY");
  }

  const seen = new Set<string>();
  for (const row of sizes) {
    const size = row.size.trim();
    if (size.length === 0) {
      throw new DomainError("Название размера не может быть пустым", "PRODUCT_SIZE_NAME_REQUIRED");
    }
    if (seen.has(size)) {
      throw new DomainError(`Размер "${size}" указан в ряду дважды`, "PRODUCT_SIZE_DUPLICATE");
    }
    seen.add(size);

    if (!(row.ratioWeight > 0)) {
      throw new DomainError(
        `Вес размера "${size}" должен быть положительным (получено ${row.ratioWeight})`,
        "PRODUCT_SIZE_WEIGHT_INVALID",
      );
    }
  }
}
