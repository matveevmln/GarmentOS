import { DomainError } from "../domain/errors";
import type { MaterialStockItem } from "../domain/material-stock";
import type { MaterialStockMovementMeta, MaterialStockRepository } from "./ports";

export interface AdjustMaterialStockInput {
  warehouseId: string;
  materialId: string;
  /** Дельта: положительная возвращает материал на склад, отрицательная списывает дополнительно. */
  delta: number;
  meta?: MaterialStockMovementMeta;
}

export interface AdjustMaterialStockDeps {
  materialStock: MaterialStockRepository;
}

// Корректировка остатка материала (владелец проекта, 2026-08-30 — «нельзя
// молча переписывать историю»). Применяется при исправлении уже внесённого
// факта раскроя: было списано 1247 м, оказалось 1230 м — на склад возвращается
// дельта +17 отдельным движением типа adjustment, а прежнее движение расхода
// остаётся нетронутым.
//
// Нулевая дельта отклоняется: движение «ничего не изменилось» засоряет журнал
// и ничего не объясняет.
export async function adjustMaterialStock(
  deps: AdjustMaterialStockDeps,
  input: AdjustMaterialStockInput,
): Promise<MaterialStockItem> {
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    throw new DomainError(
      `Корректировка остатка материала должна быть ненулевой (получено ${input.delta})`,
      "MATERIAL_STOCK_ADJUSTMENT_INVALID",
    );
  }
  return deps.materialStock.adjust(input.warehouseId, input.materialId, input.delta, input.meta ?? {});
}
