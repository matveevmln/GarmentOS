import { DomainError } from "./errors";

export type SewingOrderStatus = "draft" | "placed" | "cancelled";

// Заказ на пошив — общая шапка над одной или несколькими партиями по
// моделям у одного цеха (ADR 0002, «Штаб партии v1», владелец проекта,
// 2026-09-24). Партия (ProductionOrder) остаётся отдельной сущностью «одна
// модель у одного цеха»; эта сущность только группирует несколько партий,
// созданных одним пользовательским действием «Создать заказ», и хранит
// черновик формы до размещения.
export interface SewingOrder {
  id: string;
  companyId: string;
  workshopId: string | null;
  number: number | null;
  status: SewingOrderStatus;
  draftPayload: SewingOrderDraftPayload | null;
  version: number;
  clientRequestId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Снимок формы A02 целиком — сериализуемый JSON, домен его не разбирает
// (opaque для контракт-мануфактуринга, docs/PRINCIPLES.md принцип 2):
// содержимое формируется и читается только вызывающим (apps/api/web), здесь
// это просто jsonb-блок, который нужно сохранить и вернуть как есть.
export type SewingOrderDraftPayload = Record<string, unknown>;

export function assertCanUpdateDraft(status: SewingOrderStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Черновик заказа на пошив нельзя изменить в статусе "${status}" — только в "draft"`,
      "SEWING_ORDER_NOT_DRAFT",
    );
  }
}

export function assertVersionMatches(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new DomainError(
      `Заказ на пошив изменён в другой вкладке (ожидалась версия ${expected}, сейчас ${actual}) — обновите страницу`,
      "SEWING_ORDER_VERSION_CONFLICT",
    );
  }
}

export function assertNotCancelled(status: SewingOrderStatus): void {
  if (status === "cancelled") {
    throw new DomainError("Заказ на пошив отменён и не может быть изменён", "SEWING_ORDER_CANCELLED");
  }
}

// Проверки, обязательные перед атомарным размещением (placeSewingOrder) —
// вынесены из use case, чтобы явно называться и быть unit-тестируемыми
// отдельно от репозитория/транзакции.
export function assertCanPlace(status: SewingOrderStatus): void {
  if (status === "cancelled") {
    throw new DomainError("Отменённый заказ на пошив нельзя разместить", "SEWING_ORDER_CANCELLED");
  }
}

export interface PlaceSewingOrderModelInput {
  productId: string;
  agreedUnitPrice: number;
  materialsProvidedByUs?: boolean;
  dueDate?: string;
  variants: Array<{ productVariantId: string; quantity: number }>;
}

export function assertHasModels(models: PlaceSewingOrderModelInput[]): void {
  if (models.length === 0) {
    throw new DomainError(
      "Заказ на пошив должен содержать хотя бы одну модель",
      "SEWING_ORDER_MODELS_EMPTY",
    );
  }
}

// Модель не может повториться в рамках одного заказа скрытно (A02: «один и
// тот же SKU не дублировать скрытно», применено на уровне модели заказа —
// БД-уровень тоже защищён частичным уникальным индексом
// production_orders_sewing_order_product_idx, это — понятная ошибка вместо
// падения на constraint).
export function assertNoDuplicateModels(models: PlaceSewingOrderModelInput[]): void {
  const seen = new Set<string>();
  for (const model of models) {
    if (seen.has(model.productId)) {
      throw new DomainError(
        `Модель ${model.productId} указана в заказе более одного раза`,
        "SEWING_ORDER_DUPLICATE_MODEL",
      );
    }
    seen.add(model.productId);
  }
}
