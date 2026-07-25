import { DomainError } from "./errors";

// Себестоимость единицы SKU — материалы + услуга подрядного цеха (закупленная
// услуга по agreed_unit_price, не внутренний нормо-час) + логистика +
// накладные (docs/DATABASE_SCHEMA.md, раздел 14/0). Прибыль/маржа не
// хранятся — вычисляются из orders + cost_entries (Reporting/BI read-model).
export interface CostEntry {
  id: string;
  companyId: string;
  productVariantId: string;
  productionOrderId: string | null;
  materialCost: string;
  manufacturingCost: string;
  logisticsCost: string;
  overheadCost: string;
  calculatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function assertNonNegativeCost(value: number, field: string): void {
  if (value < 0) {
    throw new DomainError(`${field} не может быть отрицательным (получено ${value})`, "COST_ENTRY_VALUE_INVALID");
  }
}
