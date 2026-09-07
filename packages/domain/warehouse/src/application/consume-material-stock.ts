import { DomainError } from "../domain/errors";
import {
  assertPositiveMaterialQuantity,
  assertSufficientMaterialAvailable,
  parseMaterialQuantity,
  type MaterialStockItem,
} from "../domain/material-stock";
import type { MaterialStockMovementMeta, MaterialStockRepository } from "./ports";

export interface ConsumeMaterialStockInput {
  warehouseId: string;
  materialId: string;
  quantity: number;
  meta?: MaterialStockMovementMeta;
  // Разрешить списать больше, чем числится на складе (владелец проекта,
  // 2026-08-30): факт раскроя уже произошёл физически, и запрет его записать
  // хуже, чем расхождение с учётом. По умолчанию выключено — приёмка закупки
  // и любые будущие вызывающие сохраняют прежнее строгое поведение.
  allowOverdraft?: boolean;
}

export interface ConsumeMaterialStockDeps {
  materialStock: MaterialStockRepository;
}

// Расход материала — единственная точка фактического списания — внесение
// факта раскроя (владелец проекта, 2026-08-30; до этого списание висело на
// подтверждении заказа и срабатывало только на Telegram-пути).
//
// Инвариант «нельзя списать больше, чем есть» действует по умолчанию, но
// снимается флагом allowOverdraft для факта производства: остаток тогда
// уходит в минус, и это честный сигнал «приход не оприходован», а не
// повод потерять реальный расход.
export async function consumeMaterialStock(
  deps: ConsumeMaterialStockDeps,
  input: ConsumeMaterialStockInput,
): Promise<MaterialStockItem> {
  assertPositiveMaterialQuantity(input.quantity, "Количество расхода материала");

  const current = await deps.materialStock.findMaterialStockItem(input.warehouseId, input.materialId);
  if (!input.allowOverdraft) {
    if (!current) {
      throw new DomainError(
        `На складе ${input.warehouseId} нет остатка по материалу ${input.materialId} — списывать нечего`,
        "MATERIAL_STOCK_ITEM_NOT_FOUND",
      );
    }
    assertSufficientMaterialAvailable(parseMaterialQuantity(current.quantityOnHand), input.quantity);
  }

  return deps.materialStock.consume(input.warehouseId, input.materialId, input.quantity, input.meta ?? {});
}
