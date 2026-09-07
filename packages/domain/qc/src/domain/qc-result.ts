import { DomainError } from "./errors";

// ОТК (P4, владелец проекта, 2026-09-06) — приёмочный контроль партии:
// сколько реально получено от цеха, сколько годных, сколько брака. Отдельный
// бизнес-результат, не статус заказа — production_order_status не трогается
// (к моменту, когда ОТК вообще может появиться, заказ уже в терминальном
// "received"; тот статус описывает отношения с цехом, не качество поставки).
//
// Один финальный результат на партию в Pilot v1: повторная запись запрещена
// явно (assertNoExistingResult), а не только уникальным индексом в БД — тот
// же паттерн, что assertCostSnapshotNotYetSet для снимка партии (P1-1).
// Исправление результата и переделка брака (rework) — вне объёма этого
// этапа, следующий этап P5.
export interface QcResult {
  id: string;
  companyId: string;
  productionOrderId: string;
  receivedQuantity: string;
  goodQuantity: string;
  defectQuantity: string;
  comment: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QcResultDraft {
  receivedQuantity: number;
  goodQuantity: number;
  defectQuantity: number;
  comment: string | null;
}

// ОТК возможен только после того, как партия физически принята на наш
// склад — раньше нечего контролировать по количеству. "received" — уже
// существующий терминальный статус production_order_status, новый статус
// не заводится.
export function assertProductionOrderReceived(status: string): void {
  if (status !== "received") {
    throw new DomainError(
      `Нельзя внести результат ОТК для заказа в статусе "${status}" — приёмка ещё не завершена`,
      "QC_PRODUCTION_ORDER_NOT_RECEIVED",
    );
  }
}

// Нельзя оформить второй финальный результат по одной и той же партии молча
// поверх первого — как и снимок партии, результат ОТК считается зафиксированным
// фактом, а не черновиком, который можно перезаписывать.
export function assertNoExistingResult(existing: QcResult | null): void {
  if (existing) {
    throw new DomainError(
      "Результат ОТК для этой партии уже зафиксирован — повторная запись запрещена",
      "QC_RESULT_ALREADY_EXISTS",
    );
  }
}

export function assertQcQuantitiesValid(draft: QcResultDraft): void {
  for (const [field, value] of [
    ["Полученное количество", draft.receivedQuantity],
    ["Количество годных", draft.goodQuantity],
    ["Количество брака", draft.defectQuantity],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new DomainError(`${field} не может быть отрицательным (получено ${value})`, "QC_QUANTITY_INVALID");
    }
  }

  // Допуск на плавающую точку, как и везде в системе, где сравниваются
  // количества numeric(12,3) (см. assertVariantsMatchPlannedQuantity).
  if (draft.goodQuantity + draft.defectQuantity > draft.receivedQuantity + 0.0005) {
    throw new DomainError(
      `Сумма годных и брака (${draft.goodQuantity + draft.defectQuantity}) не может превышать полученное количество (${draft.receivedQuantity})`,
      "QC_QUANTITY_EXCEEDS_RECEIVED",
    );
  }
}
