import { DomainError } from "./errors";

export type ProductStatus = "draft" | "active" | "discontinued";

// Модель изделия, например «Худи Base» — принадлежит коллекции (опционально)
// и владеет матрицей SKU через ProductVariant (docs/DATABASE_SCHEMA.md, раздел 5).
export interface Product {
  id: string;
  companyId: string;
  collectionId: string | null;
  name: string;
  code: string;
  category: string | null;
  season: string | null;
  status: ProductStatus;
  techPackUrl: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function assertValidProductName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название модели не может быть пустым", "PRODUCT_NAME_REQUIRED");
  }
}

export function assertValidProductCode(code: string): void {
  if (code.trim().length === 0) {
    throw new DomainError("Артикул модели не может быть пустым", "PRODUCT_CODE_REQUIRED");
  }
}
