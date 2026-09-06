import type { QcResult, QcResultDraft } from "../domain/qc-result";

export interface NewQcResultInput extends QcResultDraft {
  companyId: string;
  productionOrderId: string;
  createdBy: string | null;
}

export interface QcResultRepository {
  create(input: NewQcResultInput): Promise<QcResult>;
  findByProductionOrder(companyId: string, productionOrderId: string): Promise<QcResult | null>;
}

// ОТК не читает таблицу заказов напрямую (docs/PRINCIPLES.md, принцип 2) —
// узкий порт, тот же паттерн, что ProductionOrderSnapshotPort у раскроя.
export interface ProductionOrderLookupPort {
  findStatus(companyId: string, productionOrderId: string): Promise<{ status: string } | null>;
}
