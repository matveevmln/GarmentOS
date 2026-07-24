import { DomainError } from "./errors";

// SKU — конкретное сочетание модель × размер × цвет
// (docs/DATABASE_SCHEMA.md, раздел 5; CLAUDE.md, глоссарий).
export interface ProductVariant {
  id: string;
  productId: string;
  size: string;
  color: string;
  skuCode: string;
  barcode: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function assertValidSize(size: string): void {
  if (size.trim().length === 0) {
    throw new DomainError("Размер SKU не может быть пустым", "PRODUCT_VARIANT_SIZE_REQUIRED");
  }
}

export function assertValidColor(color: string): void {
  if (color.trim().length === 0) {
    throw new DomainError("Цвет SKU не может быть пустым", "PRODUCT_VARIANT_COLOR_REQUIRED");
  }
}

export function assertValidSkuCode(skuCode: string): void {
  if (skuCode.trim().length === 0) {
    throw new DomainError("Код SKU (артикул) не может быть пустым", "PRODUCT_VARIANT_SKU_CODE_REQUIRED");
  }
}
