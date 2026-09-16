import { DomainError } from "./errors";

// Брак и его компенсация (ПРОМПТ №10.1/10.2, этап B, владелец проекта,
// 2026-09-15). Структурированная замена одинокого числа
// production_order_qc_results.defect_quantity — но НЕ новый агрегат партии:
// дефект и компенсация ссылаются прямо на уже существующий production_order
// (тот же, что уже служит "партией" — production_batches сознательно не
// вводится, см. PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md §26.4).
//
// productVariantId у дефекта nullable: NULL = общий брак без разбивки по
// размеру/цвету ("просто 100 шт"), заполнено — брак конкретного SKU.
// Оба варианта равноправны — деталировка добровольна, не обязательна.
export interface ProductionOrderDefect {
  id: string;
  companyId: string;
  productionOrderId: string;
  qcResultId: string | null;
  productVariantId: string | null;
  quantity: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductionOrderDefectDraft {
  productVariantId?: string | null;
  quantity: number;
  reason?: string | null;
}

// Компенсация ссылается на КОНКРЕТНЫЙ дефект, не просто "на заказ" (владелец
// проекта, п.3: "компенсация должна явно ссылаться на конкретный дефект").
// compensatingVariantId nullable — можно привязать к конкретной rework-строке
// нового заказа, но необязательно.
export interface DefectCompensation {
  id: string;
  companyId: string;
  defectId: string;
  compensatingProductionOrderId: string;
  compensatingVariantId: string | null;
  quantity: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface DefectCompensationDraft {
  defectId: string;
  compensatingProductionOrderId: string;
  compensatingVariantId?: string | null;
  quantity: number;
}

// ====== Дефект: инварианты записи ======

export function assertDefectDraftQuantityValid(draft: ProductionOrderDefectDraft): void {
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) {
    throw new DomainError(
      `Количество брака должно быть положительным (получено ${draft.quantity})`,
      "DEFECT_QUANTITY_INVALID",
    );
  }
}

// Если брак заводится с разбивкой по SKU, сумма строк обязана совпадать с
// зафиксированным в ОТК количеством брака — тот же принцип, что
// assertVariantsMatchPlannedQuantity у заказа пошива: числа не должны
// расходиться молча между формой ОТК и деталировкой брака.
export function assertDefectDraftsMatchTotal(drafts: ProductionOrderDefectDraft[], totalQuantity: number): void {
  const sum = drafts.reduce((total, draft) => total + draft.quantity, 0);
  if (Math.abs(sum - totalQuantity) > 0.0005) {
    throw new DomainError(
      `Сумма брака по разбивке (${sum}) не совпадает с зафиксированным количеством брака (${totalQuantity})`,
      "DEFECT_DRAFTS_SUM_MISMATCH",
    );
  }
}

// Каждая строка деталировки должна ссылаться на реально существующий вариант
// ЭТОГО заказа — тот же принцип, что assertReceivedVariantsValid у приёмки.
export function assertDefectVariantBelongsToOrder(productVariantId: string, knownVariantIds: Set<string>): void {
  if (!knownVariantIds.has(productVariantId)) {
    throw new DomainError(
      `Вариант ${productVariantId} не относится к этому заказу пошива`,
      "DEFECT_VARIANT_NOT_FOUND",
    );
  }
}

// Один набор дефектов на один результат ОТК — повторная запись поверх уже
// зафиксированного брака запрещена явно (тот же паттерн, что
// assertNoExistingResult у самого ОТК), не полагаемся только на то, что
// recordQcResult и так разрешает ровно один результат на заказ.
export function assertNoExistingDefectsForQcResult(existingCount: number): void {
  if (existingCount > 0) {
    throw new DomainError(
      "Брак для этого результата ОТК уже зафиксирован — повторная запись запрещена",
      "DEFECT_ALREADY_RECORDED_FOR_QC_RESULT",
    );
  }
}

// ====== Компенсация: инварианты записи ======

export function assertCompensationQuantityValid(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new DomainError(
      `Количество компенсации должно быть положительным (получено ${quantity})`,
      "DEFECT_COMPENSATION_QUANTITY_INVALID",
    );
  }
}

// Компенсация никогда не может превысить сам дефект — ни сразу, ни по сумме
// с уже существующими компенсациями (частичная компенсация в несколько
// заказов допустима, "перекомпенсация" — нет).
export function assertNoOvercompensation(
  defectQuantity: number,
  alreadyCompensated: number,
  newQuantity: number,
): void {
  if (alreadyCompensated + newQuantity > defectQuantity + 0.0005) {
    throw new DomainError(
      `Компенсация (${alreadyCompensated} + ${newQuantity}) не может превышать сам дефект (${defectQuantity})`,
      "DEFECT_OVERCOMPENSATION",
    );
  }
}

// Владелец проекта, п.3: "не считать наличие sourceProductionOrderId +
// variantType=rework само по себе достаточным основанием для автоматической
// компенсации" — компенсация создаётся ТОЛЬКО явным вызовом этого use case
// (пользователь явно подтвердил связь), но раз уж вызов явный, компенсирующий
// заказ обязан ДЕЙСТВИТЕЛЬНО ссылаться на заказ-источник дефекта через уже
// существующий sourceProductionOrderId — иначе компенсация становится
// бессмысленной записью, никак не подтверждённой на уровне данных.
export function assertCompensatingOrderReferencesDefectSource(
  compensatingOrderSourceId: string | null,
  defectProductionOrderId: string,
): void {
  if (compensatingOrderSourceId !== defectProductionOrderId) {
    throw new DomainError(
      "Компенсирующий заказ должен явно ссылаться на партию-источник дефекта (sourceProductionOrderId)",
      "DEFECT_COMPENSATION_SOURCE_MISMATCH",
    );
  }
}

// Если компенсация привязывается к конкретной строке нового заказа, эта
// строка обязана быть рефакторинг-строкой (rework) — иначе это была бы
// оплачиваемая новая потребность, ошибочно посчитанная как компенсация уже
// оплаченного брака (владелец проекта, п. "не начислять повторно").
export function assertCompensatingVariantIsRework(variantType: string | null): void {
  if (variantType !== null && variantType !== "rework") {
    throw new DomainError(
      `Строка компенсации должна быть типа "rework" (получено "${variantType}")`,
      "DEFECT_COMPENSATION_VARIANT_NOT_REWORK",
    );
  }
}
