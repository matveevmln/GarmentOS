import type { InventoryCount } from "../domain/inventory-count";
import type { InventoryCountRepository } from "./ports";

export interface CreateInventoryCountInput {
  warehouseId: string;
  performedBy?: string;
}

export interface CreateInventoryCountDeps {
  inventoryCounts: InventoryCountRepository;
}

export async function createInventoryCount(
  deps: CreateInventoryCountDeps,
  input: CreateInventoryCountInput,
): Promise<InventoryCount> {
  return deps.inventoryCounts.create(input.warehouseId, input.performedBy ?? null);
}
