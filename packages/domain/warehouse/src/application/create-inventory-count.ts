import { DomainError } from "../domain/errors";
import type { InventoryCount } from "../domain/inventory-count";
import type { InventoryCountRepository, WarehouseRepository } from "./ports";

export interface CreateInventoryCountInput {
  companyId: string;
  warehouseId: string;
  performedBy?: string;
}

export interface CreateInventoryCountDeps {
  inventoryCounts: InventoryCountRepository;
  warehouses: WarehouseRepository;
}

// warehouseId приходит из тела запроса, поэтому принадлежность склада
// компании проверяется здесь: иначе инвентаризацию можно было бы завести
// на чужом складе, зная его UUID (Step 4A.2).
export async function createInventoryCount(
  deps: CreateInventoryCountDeps,
  input: CreateInventoryCountInput,
): Promise<InventoryCount> {
  const warehouse = await deps.warehouses.findById(input.companyId, input.warehouseId);
  if (!warehouse) {
    throw new DomainError(`Склад ${input.warehouseId} не найден в этой компании`, "WAREHOUSE_NOT_FOUND");
  }

  return deps.inventoryCounts.create(input.warehouseId, input.performedBy ?? null);
}
