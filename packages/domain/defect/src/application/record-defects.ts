import { DomainError } from "../domain/errors";
import {
  assertDefectDraftQuantityValid,
  assertDefectDraftsMatchTotal,
  assertDefectVariantBelongsToOrder,
  assertNoExistingDefectsForQcResult,
  type ProductionOrderDefect,
  type ProductionOrderDefectDraft,
} from "../domain/defect";
import type { ProductionOrderDefectRepository, ProductionOrderLookupPort } from "./ports";

export interface RecordDefectsInput {
  companyId: string;
  productionOrderId: string;
  qcResultId: string | null;
  totalDefectQuantity: number;
  drafts: ProductionOrderDefectDraft[];
  createdBy: string | null;
}

export interface RecordDefectsDeps {
  defects: ProductionOrderDefectRepository;
  productionOrders: ProductionOrderLookupPort;
}

export interface ValidateDefectDraftsInput {
  companyId: string;
  productionOrderId: string;
  totalDefectQuantity: number;
  drafts: ProductionOrderDefectDraft[];
}

// Вынесено из recordDefects (владелец проекта, этап B): вызывающая сторона
// (QcService) должна проверить корректность разбивки ДО того, как результат
// ОТК будет записан в БД — иначе невалидная разбивка приводит к висящему
// результату ОТК без брака и без возможности повторить запись (QC —
// "ровно один финальный результат на заказ"). Этой проверке не нужен
// qcResultId — она не создаёт строк и не знает о конкретном результате ОТК.
export async function validateDefectDrafts(
  deps: { productionOrders: ProductionOrderLookupPort },
  input: ValidateDefectDraftsInput,
): Promise<void> {
  if (input.drafts.length === 0) {
    throw new DomainError("Список строк брака не может быть пустым", "DEFECT_DRAFTS_EMPTY");
  }
  for (const draft of input.drafts) assertDefectDraftQuantityValid(draft);
  assertDefectDraftsMatchTotal(input.drafts, input.totalDefectQuantity);

  const variantDrafts = input.drafts.filter((draft) => draft.productVariantId);
  if (variantDrafts.length > 0) {
    const order = await deps.productionOrders.findById(input.companyId, input.productionOrderId);
    if (!order) {
      throw new DomainError(`Заказ пошива ${input.productionOrderId} не найден`, "DEFECT_PRODUCTION_ORDER_NOT_FOUND");
    }
    const knownVariantIds = new Set(order.variants.map((variant) => variant.productVariantId));
    for (const draft of variantDrafts) {
      assertDefectVariantBelongsToOrder(draft.productVariantId as string, knownVariantIds);
    }
  }
}

// Запись брака одной партии (ПРОМПТ №10.2, этап B). Вызывается либо
// автоматически из QcService сразу после recordQcResult (одна строка-агрегат
// на весь defectQuantity, без деталировки — Zero Input по умолчанию), либо
// с явной разбивкой по SKU, если пользователь её указал в той же форме ОТК.
// Оба пути — один и тот же use case: единственное отличие в том, что именно
// содержит `drafts` (одна агрегатная строка или несколько по вариантам).
export async function recordDefects(
  deps: RecordDefectsDeps,
  input: RecordDefectsInput,
): Promise<ProductionOrderDefect[]> {
  await validateDefectDrafts(deps, input);

  if (input.qcResultId) {
    const existingCount = await deps.defects.countByQcResult(input.companyId, input.qcResultId);
    assertNoExistingDefectsForQcResult(existingCount);
  }

  return deps.defects.createMany(
    input.drafts.map((draft) => ({
      companyId: input.companyId,
      productionOrderId: input.productionOrderId,
      qcResultId: input.qcResultId,
      productVariantId: draft.productVariantId ?? null,
      quantity: draft.quantity,
      reason: draft.reason ?? null,
      createdBy: input.createdBy,
    })),
  );
}
