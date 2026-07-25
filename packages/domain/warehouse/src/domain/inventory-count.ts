export type InventoryCountStatus = "in_progress" | "completed" | "cancelled";

export interface InventoryCountItem {
  id: string;
  inventoryCountId: string;
  productVariantId: string;
  expectedQuantity: string;
  actualQuantity: string;
  discrepancy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Инвентаризация — сверка фактического остатка с системным
// (docs/DATABASE_SCHEMA.md, раздел 9). Расхождение (discrepancy) считается
// автоматически при добавлении строки, не вводится пользователем — это и
// есть точка обнаружения расхождений (см. критерий успеха №1, PROJECT_VISION.md).
export interface InventoryCount {
  id: string;
  warehouseId: string;
  status: InventoryCountStatus;
  performedBy: string | null;
  performedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: InventoryCountItem[];
}
