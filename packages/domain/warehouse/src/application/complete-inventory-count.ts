import { DomainError } from "../domain/errors";
import type { InventoryCount } from "../domain/inventory-count";
import type { InventoryCountRepository } from "./ports";

export interface CompleteInventoryCountInput {
  inventoryCountId: string;
}

export interface CompleteInventoryCountDeps {
  inventoryCounts: InventoryCountRepository;
}

export async function completeInventoryCount(
  deps: CompleteInventoryCountDeps,
  input: CompleteInventoryCountInput,
): Promise<InventoryCount> {
  const count = await deps.inventoryCounts.findById(input.inventoryCountId);
  if (!count) {
    throw new DomainError(`Инвентаризация ${input.inventoryCountId} не найдена`, "INVENTORY_COUNT_NOT_FOUND");
  }
  if (count.status !== "in_progress") {
    throw new DomainError(
      `Нельзя завершить инвентаризацию в статусе "${count.status}" — только из "in_progress"`,
      "INVENTORY_COUNT_NOT_IN_PROGRESS",
    );
  }

  return deps.inventoryCounts.updateStatus(count.id, "completed", new Date());
}
