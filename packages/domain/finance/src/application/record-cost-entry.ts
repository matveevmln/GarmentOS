import { assertNonNegativeCost, type CostEntry } from "../domain/cost-entry";
import type { CostEntryRepository } from "./ports";

export interface RecordCostEntryInput {
  companyId: string;
  productVariantId: string;
  productionOrderId?: string;
  materialCost: number;
  manufacturingCost: number;
  logisticsCost?: number;
  overheadCost?: number;
}

export interface RecordCostEntryDeps {
  costEntries: CostEntryRepository;
}

export async function recordCostEntry(deps: RecordCostEntryDeps, input: RecordCostEntryInput): Promise<CostEntry> {
  assertNonNegativeCost(input.materialCost, "Стоимость материалов");
  assertNonNegativeCost(input.manufacturingCost, "Стоимость услуги цеха");
  const logisticsCost = input.logisticsCost ?? 0;
  const overheadCost = input.overheadCost ?? 0;
  assertNonNegativeCost(logisticsCost, "Логистические расходы");
  assertNonNegativeCost(overheadCost, "Накладные расходы");

  return deps.costEntries.create({
    companyId: input.companyId,
    productVariantId: input.productVariantId,
    productionOrderId: input.productionOrderId ?? null,
    materialCost: input.materialCost,
    manufacturingCost: input.manufacturingCost,
    logisticsCost,
    overheadCost,
  });
}
