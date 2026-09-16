import type { DefectCompensation, DefectCompensationDraft, ProductionOrderDefect, ProductionOrderDefectDraft } from "../domain/defect";

export interface NewProductionOrderDefectInput extends ProductionOrderDefectDraft {
  companyId: string;
  productionOrderId: string;
  qcResultId: string | null;
  createdBy: string | null;
}

export interface ProductionOrderDefectRepository {
  create(input: NewProductionOrderDefectInput): Promise<ProductionOrderDefect>;
  createMany(inputs: NewProductionOrderDefectInput[]): Promise<ProductionOrderDefect[]>;
  findById(companyId: string, id: string): Promise<ProductionOrderDefect | null>;
  listByProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrderDefect[]>;
  // Идемпотентность записи брака из формы ОТК (ровно один набор строк на
  // результат ОТК) — assertNoExistingDefectsForQcResult.
  countByQcResult(companyId: string, qcResultId: string): Promise<number>;
}

export interface NewDefectCompensationInput extends DefectCompensationDraft {
  companyId: string;
  createdBy: string | null;
}

export interface DefectCompensationRepository {
  create(input: NewDefectCompensationInput): Promise<DefectCompensation>;
  listByDefect(companyId: string, defectId: string): Promise<DefectCompensation[]>;
  // Массовая выборка для витрины "Брак / Компенсировано / Осталось" по всей
  // партии одним запросом, а не N+1 по каждому дефекту отдельно.
  listByDefectIds(companyId: string, defectIds: string[]): Promise<DefectCompensation[]>;
}

// Дефект/компенсация не читают таблицу заказов напрямую
// (docs/PRINCIPLES.md, принцип 2) — узкий порт в Contract Manufacturing,
// тот же паттерн, что ProductionOrderLookupPort у ОТК и BomApprovalPort у
// раскроя/заказов.
export interface ProductionOrderVariantInfo {
  id: string;
  productVariantId: string;
  variantType: string;
}

export interface ProductionOrderInfo {
  id: string;
  sourceProductionOrderId: string | null;
  variants: ProductionOrderVariantInfo[];
}

export interface ProductionOrderLookupPort {
  findById(companyId: string, id: string): Promise<ProductionOrderInfo | null>;
}
