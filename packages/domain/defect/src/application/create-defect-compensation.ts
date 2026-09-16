import { DomainError } from "../domain/errors";
import {
  assertCompensatingOrderReferencesDefectSource,
  assertCompensatingVariantIsRework,
  assertCompensationQuantityValid,
  assertNoOvercompensation,
  type DefectCompensation,
} from "../domain/defect";
import type { DefectCompensationRepository, ProductionOrderDefectRepository, ProductionOrderLookupPort } from "./ports";

export interface CreateDefectCompensationInput {
  companyId: string;
  defectId: string;
  compensatingProductionOrderId: string;
  compensatingVariantId?: string | null;
  quantity: number;
  createdBy: string | null;
}

export interface CreateDefectCompensationDeps {
  defects: ProductionOrderDefectRepository;
  compensations: DefectCompensationRepository;
  productionOrders: ProductionOrderLookupPort;
}

// Явное подтверждение компенсации (ПРОМПТ №10.2, этап B, владелец проекта,
// п.3): НИКОГДА не вызывается автоматически одним лишь наличием
// sourceProductionOrderId/variantType='rework' на новом заказе — только этим
// use case, по прямому действию пользователя ("Добавить компенсацию"). Раз
// вызов явный, дальше use case строго проверяет, что связь действительно
// корректна (заказ реально ссылается на партию-источник, компенсация не
// превышает сам дефект) — доверие к пользовательскому клику не отменяет
// проверку целостности данных.
export async function createDefectCompensation(
  deps: CreateDefectCompensationDeps,
  input: CreateDefectCompensationInput,
): Promise<DefectCompensation> {
  assertCompensationQuantityValid(input.quantity);

  const defect = await deps.defects.findById(input.companyId, input.defectId);
  if (!defect) {
    throw new DomainError(`Дефект ${input.defectId} не найден в этой компании`, "DEFECT_NOT_FOUND");
  }

  const compensatingOrder = await deps.productionOrders.findById(input.companyId, input.compensatingProductionOrderId);
  if (!compensatingOrder) {
    throw new DomainError(
      `Компенсирующий заказ пошива ${input.compensatingProductionOrderId} не найден`,
      "DEFECT_COMPENSATION_ORDER_NOT_FOUND",
    );
  }
  assertCompensatingOrderReferencesDefectSource(compensatingOrder.sourceProductionOrderId, defect.productionOrderId);

  if (input.compensatingVariantId) {
    const variant = compensatingOrder.variants.find((row) => row.id === input.compensatingVariantId);
    if (!variant) {
      throw new DomainError(
        `Строка ${input.compensatingVariantId} не относится к компенсирующему заказу`,
        "DEFECT_COMPENSATION_VARIANT_NOT_FOUND",
      );
    }
    assertCompensatingVariantIsRework(variant.variantType);
  }

  const existingCompensations = await deps.compensations.listByDefect(input.companyId, input.defectId);
  const alreadyCompensated = existingCompensations.reduce((sum, row) => sum + Number(row.quantity), 0);
  assertNoOvercompensation(Number(defect.quantity), alreadyCompensated, input.quantity);

  return deps.compensations.create({
    companyId: input.companyId,
    defectId: input.defectId,
    compensatingProductionOrderId: input.compensatingProductionOrderId,
    compensatingVariantId: input.compensatingVariantId ?? null,
    quantity: input.quantity,
    createdBy: input.createdBy,
  });
}
