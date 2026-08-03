import { DomainError } from "./errors";

export type ProductionOrderStatus =
  | "draft"
  | "placed"
  | "in_progress"
  | "ready_for_pickup"
  | "received"
  | "cancelled";

export interface ProductionOrderVariant {
  id: string;
  productionOrderId: string;
  productVariantId: string;
  quantity: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionOrder {
  id: string;
  companyId: string;
  productId: string;
  bomId: string;
  workshopId: string;
  plannedQuantity: string;
  agreedUnitPrice: string;
  materialsProvidedByUs: boolean;
  status: ProductionOrderStatus;
  dueDate: string | null;
  receivedAt: Date | null;
  // Snapshot партии, зафиксированный при подтверждении (см. миграцию
  // cost_snapshot) — намеренно нетипизирован в домене: точную форму
  // (ProductionOrderCostSnapshot) знает только API-слой, который её же и
  // заполняет через CostingService. Домен Contract Manufacturing не должен
  // знать о ценах материалов/себестоимости — это чужая ответственность
  // (docs/PRINCIPLES.md, принцип 2).
  costSnapshot: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  variants: ProductionOrderVariant[];
}

export interface ProductionOrderVariantDraft {
  productVariantId: string;
  quantity: number;
}

// Разбивка по SKU не может быть пустой — заказ пошива размещается на
// конкретный объём по конкретным размерам/цветам (docs/DATABASE_SCHEMA.md,
// раздел 8).
export function assertHasVariants(variants: ProductionOrderVariantDraft[]): void {
  if (variants.length === 0) {
    throw new DomainError(
      "Заказ пошива должен содержать хотя бы одну строку разбивки по SKU",
      "PRODUCTION_ORDER_VARIANTS_EMPTY",
    );
  }
}

export function assertValidVariant(variant: ProductionOrderVariantDraft): void {
  if (variant.quantity <= 0) {
    throw new DomainError(
      `Количество по SKU должно быть положительным (получено ${variant.quantity})`,
      "PRODUCTION_ORDER_VARIANT_QUANTITY_INVALID",
    );
  }
}

export function assertValidPlannedQuantity(plannedQuantity: number): void {
  if (plannedQuantity <= 0) {
    throw new DomainError(
      `Плановое количество должно быть положительным (получено ${plannedQuantity})`,
      "PRODUCTION_ORDER_PLANNED_QUANTITY_INVALID",
    );
  }
}

export function assertValidUnitPrice(agreedUnitPrice: number): void {
  if (agreedUnitPrice < 0) {
    throw new DomainError(
      `Согласованная цена за единицу не может быть отрицательной (получено ${agreedUnitPrice})`,
      "PRODUCTION_ORDER_UNIT_PRICE_INVALID",
    );
  }
}

// Ключевой инвариант, найденный в USER_JOURNEY_AUDIT.md и зафиксированный в
// ROADMAP.md (Итерация 3): нельзя разместить заказ пошива без утверждённого
// (approved) BOM модели. Проверка "approved ли конкретный bomId" делегирована
// в модуль BOM через порт (application/ports.ts) — Contract Manufacturing не
// читает таблицу boms напрямую (docs/PRINCIPLES.md, принцип 2).
export function assertBomIsApproved(isApproved: boolean, bomId: string): void {
  if (!isApproved) {
    throw new DomainError(
      `Нельзя разместить заказ пошива: BOM ${bomId} не утверждён (approved) для этой модели`,
      "PRODUCTION_ORDER_BOM_NOT_APPROVED",
    );
  }
}

// Инвариант: подтвердить (разместить у цеха) можно только черновик — тот же
// draft-first паттерн, что и в Materials & Procurement.
export function assertCanConfirm(status: ProductionOrderStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Нельзя подтвердить заказ пошива в статусе "${status}" — подтверждение доступно только для черновика`,
      "PRODUCTION_ORDER_NOT_DRAFT",
    );
  }
}

// Приёмка партии на наш склад (Итерация 10) — подтверждается нашей стороной
// после того, как цех сообщил "готово к отгрузке"; нельзя принять черновик,
// уже размещённый в работе заказ или уже принятую/отменённую партию. Для
// MVP "received" — терминальный статус заказа (закрытие заказа = приёмка),
// разбор по партиям/браку сознательно отложен до Баланса производственной
// партии (docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md).
export function assertCanReceive(status: ProductionOrderStatus): void {
  if (status !== "ready_for_pickup") {
    throw new DomainError(
      `Нельзя принять заказ пошива в статусе "${status}" — приёмка доступна только когда цех сообщил "готово к отгрузке"`,
      "PRODUCTION_ORDER_NOT_READY_FOR_PICKUP",
    );
  }
}

// Статус, который цех сообщает сам (простой текстовый ответ в Telegram,
// docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md, раздел 4) — узкий набор,
// достаточный для Итерации 7: "начали шить"/"готово". "received" — это
// приёмка на нашем складе, подтверждается нашей стороной, не цехом; терминальные
// статусы (received/cancelled) не переоткрываются входящим сообщением.
export function assertCanUpdateStatusFromWorkshop(
  current: ProductionOrderStatus,
  next: "in_progress" | "ready_for_pickup",
): void {
  if (current === "received" || current === "cancelled") {
    throw new DomainError(
      `Заказ пошива в статусе "${current}" — обновление статуса цехом больше не применяется`,
      "PRODUCTION_ORDER_INVALID_STATUS_TRANSITION",
    );
  }
  if (current === "draft") {
    throw new DomainError(
      "Заказ пошива ещё черновик — цех не может обновлять статус заказа, который ему не подтверждён",
      "PRODUCTION_ORDER_INVALID_STATUS_TRANSITION",
    );
  }
  if (next === "in_progress" && current !== "placed") {
    throw new DomainError(
      `Нельзя перевести заказ пошива в "в работе" из статуса "${current}"`,
      "PRODUCTION_ORDER_INVALID_STATUS_TRANSITION",
    );
  }
}
