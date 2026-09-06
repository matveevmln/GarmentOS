import { DomainError } from "../domain/errors";
import {
  assertNoExistingResult,
  assertProductionOrderReceived,
  assertQcQuantitiesValid,
  type QcResult,
  type QcResultDraft,
} from "../domain/qc-result";
import type { ProductionOrderLookupPort, QcResultRepository } from "./ports";

export interface RecordQcResultInput extends QcResultDraft {
  companyId: string;
  productionOrderId: string;
  createdBy: string | null;
}

export interface RecordQcResultDeps {
  qcResults: QcResultRepository;
  productionOrders: ProductionOrderLookupPort;
}

// Внесение результата ОТК (P4, владелец проекта, 2026-09-06). Единственная
// точка записи: проверяет, что заказ действительно принят, что цифры не
// противоречат друг другу, и что по этой партии ещё не было финального
// результата — только после этого пишет.
//
// Намеренно НЕ делает: не меняет production_order_status, не списывает
// материалы, не трогает cost_snapshot/BOM/раскрой, не создаёт задание на
// переделку. Всё это — либо чужая ответственность, либо следующий этап (P5).
export async function recordQcResult(deps: RecordQcResultDeps, input: RecordQcResultInput): Promise<QcResult> {
  const order = await deps.productionOrders.findStatus(input.companyId, input.productionOrderId);
  if (!order) {
    throw new DomainError(`Заказ пошива ${input.productionOrderId} не найден`, "QC_PRODUCTION_ORDER_NOT_FOUND");
  }
  assertProductionOrderReceived(order.status);
  assertQcQuantitiesValid(input);

  const existing = await deps.qcResults.findByProductionOrder(input.companyId, input.productionOrderId);
  assertNoExistingResult(existing);

  return deps.qcResults.create({
    companyId: input.companyId,
    productionOrderId: input.productionOrderId,
    receivedQuantity: input.receivedQuantity,
    goodQuantity: input.goodQuantity,
    defectQuantity: input.defectQuantity,
    comment: input.comment,
    createdBy: input.createdBy,
  });
}
