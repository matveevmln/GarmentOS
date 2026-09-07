import type { CuttingExecutorType, CuttingOrder, CuttingOrderStatus } from "../domain/cutting-order";

export interface NewCuttingOrderMaterialInput {
  materialId: string;
  unit: string;
  requiredQuantity: number;
  allocatedQuantity: number | null;
  rollNote: string | null;
}

export interface NewCuttingOrderResultInput {
  productVariantId: string;
  plannedQuantity: number;
}

export interface NewCuttingOrderInput {
  companyId: string;
  productionOrderId: string;
  number: number;
  executorType: CuttingExecutorType;
  executorWorkshopId: string | null;
  comment: string | null;
  createdBy: string | null;
  materials: NewCuttingOrderMaterialInput[];
  results: NewCuttingOrderResultInput[];
}

export interface CuttingOrderMaterialFactInput {
  materialId: string;
  consumedQuantity: number;
  rollNote?: string | null;
}

export interface CuttingOrderResultFactInput {
  productVariantId: string;
  actualQuantity: number;
}

export interface CuttingOrderRepository {
  create(input: NewCuttingOrderInput): Promise<CuttingOrder>;
  findById(companyId: string, id: string): Promise<CuttingOrder | null>;
  listByProductionOrder(companyId: string, productionOrderId: string): Promise<CuttingOrder[]>;
  countByProductionOrder(companyId: string, productionOrderId: string): Promise<number>;
  updateStatus(id: string, status: CuttingOrderStatus, timestamps: { issuedAt?: Date; completedAt?: Date }): Promise<CuttingOrder>;
  /** Правка «выделено»/комментария о рулонах до выдачи в крой. */
  updateAllocations(id: string, rows: Array<{ materialId: string; allocatedQuantity: number | null; rollNote: string | null }>): Promise<CuttingOrder>;
  recordFact(id: string, materials: CuttingOrderMaterialFactInput[], results: CuttingOrderResultFactInput[]): Promise<CuttingOrder>;
}

// Раскрой не читает таблицы заказа напрямую (docs/PRINCIPLES.md, принцип 2) —
// всё, что ему нужно от Contract Manufacturing, описано этим узким портом.
export interface ProductionOrderSnapshotPort {
  findForCutting(
    companyId: string,
    productionOrderId: string,
  ): Promise<{
    status: string;
    plannedQuantity: number;
    variants: Array<{ productVariantId: string; quantity: number }>;
    materialNorms: Array<{ materialId: string; unit: string; quantityPerUnit: number; wastePercent: number }>;
  } | null>;
}

// Списание и корректировка остатка — тоже через порт, чтобы раскрой не зависел
// от модуля Warehouse напрямую.
export interface MaterialStockPort {
  consume(
    warehouseId: string,
    materialId: string,
    quantity: number,
    meta: { referenceType: string; referenceId: string; createdBy: string | null },
  ): Promise<void>;
  adjust(
    warehouseId: string,
    materialId: string,
    delta: number,
    meta: { referenceType: string; referenceId: string; createdBy: string | null },
  ): Promise<void>;
  quantityOnHand(warehouseId: string, materialId: string): Promise<number>;
}
