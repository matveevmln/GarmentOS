import { DomainError } from "./errors";

// Раскройное задание (владелец проекта, 2026-08-30) — наша производственная
// операция между «заказ размещён» и «цех шьёт».
//
// Задание НЕ копирует данные заказа: матрица размер×цвет уже заморожена в
// production_order_variants, нормы и цены — в production_orders.cost_snapshot.
// Здесь живёт только то, чего больше нигде нет: решения человека (сколько
// выделено, сколько фактически ушло) и результат кроя.
export type CuttingOrderStatus = "draft" | "issued" | "completed" | "cancelled";

export type CuttingExecutorType = "in_house" | "workshop";

export interface CuttingOrderMaterial {
  id: string;
  cuttingOrderId: string;
  materialId: string;
  unit: string;
  requiredQuantity: string;
  allocatedQuantity: string | null;
  consumedQuantity: string | null;
  rollNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CuttingOrderResult {
  id: string;
  cuttingOrderId: string;
  productVariantId: string;
  plannedQuantity: string;
  actualQuantity: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CuttingOrder {
  id: string;
  companyId: string;
  productionOrderId: string;
  number: number;
  status: CuttingOrderStatus;
  executorType: CuttingExecutorType;
  executorWorkshopId: string | null;
  issuedAt: Date | null;
  completedAt: Date | null;
  comment: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  materials: CuttingOrderMaterial[];
  results: CuttingOrderResult[];
}

// Инвариант исполнителя — тот же, что уже действует для складов цехов
// (warehouses.workshop_id, assertWorkshopIdConsistency): ссылка на цех
// обязательна ровно тогда, когда раскрой отдан подрядчику.
export function assertExecutorConsistency(
  executorType: CuttingExecutorType,
  executorWorkshopId: string | null,
): void {
  if (executorType === "workshop" && !executorWorkshopId) {
    throw new DomainError(
      "Для раскроя у подрядчика нужно указать цех",
      "CUTTING_EXECUTOR_WORKSHOP_REQUIRED",
    );
  }
  if (executorType === "in_house" && executorWorkshopId) {
    throw new DomainError(
      "Для собственного раскроя цех-подрядчик не указывается",
      "CUTTING_EXECUTOR_WORKSHOP_NOT_ALLOWED",
    );
  }
}

// Раскройное задание выпускается по подтверждённому заказу: у черновика ещё
// нет ни зафиксированных норм, ни матрицы, по которой можно кроить.
export function assertProductionOrderCanBeCut(status: string): void {
  if (status === "draft") {
    throw new DomainError(
      "Нельзя создать раскройное задание по черновику заказа — сначала подтвердите заказ",
      "CUTTING_PRODUCTION_ORDER_NOT_CONFIRMED",
    );
  }
  if (status === "cancelled") {
    throw new DomainError(
      "Нельзя создать раскройное задание по отменённому заказу",
      "CUTTING_PRODUCTION_ORDER_CANCELLED",
    );
  }
}

export function assertCanIssue(status: CuttingOrderStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Нельзя выдать в крой задание в состоянии "${status}" — выдаётся только черновик`,
      "CUTTING_ORDER_NOT_DRAFT",
    );
  }
}

export function assertCanRecordResult(status: CuttingOrderStatus): void {
  if (status !== "issued") {
    throw new DomainError(
      `Нельзя внести факт кроя для задания в состоянии "${status}" — факт вносится по выданному в крой заданию`,
      "CUTTING_ORDER_NOT_ISSUED",
    );
  }
}

// Исправление факта разрешено (владелец проекта, 2026-08-30: «нельзя молча
// переписывать историю») — но только у завершённого задания, и через
// корректирующее движение, а не переписыванием прошлого.
export function assertCanCorrectResult(status: CuttingOrderStatus): void {
  if (status !== "completed") {
    throw new DomainError(
      `Исправлять факт можно только у завершённого задания (текущее состояние — "${status}")`,
      "CUTTING_ORDER_NOT_COMPLETED",
    );
  }
}

export function assertCanCancel(status: CuttingOrderStatus): void {
  if (status === "completed") {
    throw new DomainError(
      "Нельзя отменить завершённое раскройное задание — исправьте факт, если он внесён с ошибкой",
      "CUTTING_ORDER_ALREADY_COMPLETED",
    );
  }
  if (status === "cancelled") {
    throw new DomainError("Раскройное задание уже отменено", "CUTTING_ORDER_ALREADY_CANCELLED");
  }
}

export function assertNonNegativeQuantity(quantity: number, field: string): void {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new DomainError(
      `${field} не может быть отрицательным (получено ${quantity})`,
      "CUTTING_QUANTITY_INVALID",
    );
  }
}
