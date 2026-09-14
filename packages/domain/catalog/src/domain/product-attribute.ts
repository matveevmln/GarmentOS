import { DomainError } from "./errors";

// Характеристика модели — «Состав: 95% хлопок, 5% лайкра», «Плотность:
// 260 г/м²» и т.п. (Этап 2 — «Паспорт модели», владелец проекта, 2026-09-12,
// требование №3). Обычная пара name/value, а не JSON — набор характеристик у
// разных моделей разный и заранее не перечислим, но список должен нормально
// листаться, сортироваться и войти в audit_log readable-диффом.
export interface ProductAttribute {
  id: string;
  productId: string;
  name: string;
  value: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductAttributeDraft {
  name: string;
  value: string;
}

export function assertValidProductAttribute(draft: ProductAttributeDraft): void {
  if (draft.name.trim().length === 0) {
    throw new DomainError("Название характеристики не может быть пустым", "PRODUCT_ATTRIBUTE_NAME_REQUIRED");
  }
  if (draft.value.trim().length === 0) {
    throw new DomainError("Значение характеристики не может быть пустым", "PRODUCT_ATTRIBUTE_VALUE_REQUIRED");
  }
}
