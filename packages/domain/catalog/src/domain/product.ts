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
  // Плановые составляющие себестоимости, не выводимые из BOM (см.
  // docs/PRODUCT_MODEL_ARCHITECTURE.md, раздел 6): ткань/фурнитура/упаковка
  // считаются из bom_items × текущая цена материала, эти два поля — прямой
  // ввод (владелец проекта, 2026-08-03 — расчёт стоимости спецификации).
  standardSewingCost: string | null;
  // Валюта каждой суммы — своя (P1, hardening перед «Стеганкой», владелец
  // проекта, 2026-09-07): costing.service.ts раньше жёстко считал обе суммы
  // в RUB, из-за чего услугу вроде стёжки (реально оплачиваемую в KGS) нельзя
  // было завести, не смешав валюты молча (docs/PRINCIPLES.md, принцип 21).
  // null у существующих строк без суммы — валюте просто нечего описывать.
  standardSewingCostCurrency: string | null;
  otherProductionCost: string | null;
  otherProductionCostCurrency: string | null;
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

export function assertNonNegativeCost(value: number, label: string): void {
  if (value < 0) {
    throw new DomainError(`${label} не может быть отрицательной (получено ${value})`, "PRODUCT_COST_INVALID");
  }
}
