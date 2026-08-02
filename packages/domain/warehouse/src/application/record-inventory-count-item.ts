import { DomainError } from "../domain/errors";
import type { InventoryCount } from "../domain/inventory-count";
import type { InventoryCountRepository, StockRepository } from "./ports";

export interface RecordInventoryCountItemInput {
  inventoryCountId: string;
  productVariantId: string;
  actualQuantity: number;
  createdBy?: string;
}

export interface RecordInventoryCountItemDeps {
  inventoryCounts: InventoryCountRepository;
  stock: StockRepository;
}

// Записывает фактически подсчитанное количество по одному SKU. Расхождение
// (docs/DATABASE_SCHEMA.md, раздел 9) считается автоматически от текущего
// системного остатка — пользователь вводит только то, что реально насчитал,
// не сам разницу (Zero Input, PRINCIPLES.md принцип 17). Если расхождение
// не нулевое — остаток на складе корректируется движением type='adjustment'
// (stock.adjust), то есть инвентаризация — единственный легитимный способ
// поправить quantityOnHand напрямую, в обход receipt/dispatch/transfer.
export async function recordInventoryCountItem(
  deps: RecordInventoryCountItemDeps,
  input: RecordInventoryCountItemInput,
): Promise<InventoryCount> {
  const count = await deps.inventoryCounts.findById(input.inventoryCountId);
  if (!count) {
    throw new DomainError(`Инвентаризация ${input.inventoryCountId} не найдена`, "INVENTORY_COUNT_NOT_FOUND");
  }
  if (count.status !== "in_progress") {
    throw new DomainError(
      `Нельзя добавить позицию в инвентаризацию в статусе "${count.status}" — только для "in_progress"`,
      "INVENTORY_COUNT_NOT_IN_PROGRESS",
    );
  }

  const { discrepancy } = await deps.stock.adjust(
    count.warehouseId,
    input.productVariantId,
    input.actualQuantity,
    input.createdBy ?? null,
  );
  const expectedQuantity = input.actualQuantity - discrepancy;

  return deps.inventoryCounts.addItem(count.id, input.productVariantId, expectedQuantity, input.actualQuantity, discrepancy);
}
