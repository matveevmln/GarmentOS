import { DomainError } from "../domain/errors";
import {
  assertCanCorrectResult,
  assertCanRecordResult,
  assertNonNegativeQuantity,
  type CuttingOrder,
} from "../domain/cutting-order";
import type { CuttingOrderRepository, MaterialStockPort } from "./ports";

export const CUTTING_REFERENCE_TYPE = "cutting_order";

export interface CuttingFactInput {
  companyId: string;
  cuttingOrderId: string;
  /** Склад, с которого реально брали материал — выбирается явно, не угадывается. */
  warehouseId: string;
  materials: Array<{ materialId: string; consumedQuantity: number; rollNote?: string | null }>;
  results: Array<{ productVariantId: string; actualQuantity: number }>;
  recordedBy?: string | null;
}

export interface CuttingFactDeps {
  cuttingOrders: CuttingOrderRepository;
  materialStock: MaterialStockPort;
}

/** Расхождение с учётом: столько материала не хватало на складе на момент списания. */
export interface StockShortage {
  materialId: string;
  onHandBefore: number;
  consumed: number;
  shortage: number;
}

export interface CuttingFactResult {
  cuttingOrder: CuttingOrder;
  /** Пусто, если остатков хватило. Факт сохраняется в любом случае. */
  shortages: StockShortage[];
}

function validate(input: CuttingFactInput, order: CuttingOrder): void {
  const knownMaterials = new Set(order.materials.map((row) => row.materialId));
  for (const row of input.materials) {
    if (!knownMaterials.has(row.materialId)) {
      throw new DomainError(
        `Материал ${row.materialId} не входит в это раскройное задание`,
        "CUTTING_MATERIAL_NOT_IN_ORDER",
      );
    }
    assertNonNegativeQuantity(row.consumedQuantity, "Фактический расход материала");
  }

  const knownVariants = new Set(order.results.map((row) => row.productVariantId));
  for (const row of input.results) {
    if (!knownVariants.has(row.productVariantId)) {
      throw new DomainError(
        `Размер/цвет ${row.productVariantId} не входит в это раскройное задание`,
        "CUTTING_VARIANT_NOT_IN_ORDER",
      );
    }
    assertNonNegativeQuantity(row.actualQuantity, "Фактически выкроенное количество");
  }
}

// Внесение факта кроя — единственная точка фактического списания материала в
// системе (владелец проекта, 2026-08-30; раньше расход висел на подтверждении
// заказа и срабатывал только на Telegram-пути).
//
// Нехватка остатка НЕ блокирует: крой физически уже произошёл, и запретить его
// записать значило бы потерять реальный расход ради красоты учёта. Списывается
// весь фактический расход, остаток может уйти в минус, а расхождение
// возвращается вызывающему, чтобы интерфейс показал предупреждение.
export async function recordCuttingFact(
  deps: CuttingFactDeps,
  input: CuttingFactInput,
): Promise<CuttingFactResult> {
  const order = await deps.cuttingOrders.findById(input.companyId, input.cuttingOrderId);
  if (!order) {
    throw new DomainError(`Раскройное задание ${input.cuttingOrderId} не найдено`, "CUTTING_ORDER_NOT_FOUND");
  }
  assertCanRecordResult(order.status);
  validate(input, order);

  const shortages: StockShortage[] = [];
  for (const row of input.materials) {
    if (row.consumedQuantity === 0) continue;
    const onHand = await deps.materialStock.quantityOnHand(input.warehouseId, row.materialId);
    if (onHand < row.consumedQuantity) {
      shortages.push({
        materialId: row.materialId,
        onHandBefore: onHand,
        consumed: row.consumedQuantity,
        shortage: row.consumedQuantity - onHand,
      });
    }
    await deps.materialStock.consume(input.warehouseId, row.materialId, row.consumedQuantity, {
      referenceType: CUTTING_REFERENCE_TYPE,
      referenceId: order.id,
      createdBy: input.recordedBy ?? null,
    });
  }

  const withFact = await deps.cuttingOrders.recordFact(order.id, input.materials, input.results);
  const completed = await deps.cuttingOrders.updateStatus(withFact.id, "completed", {
    completedAt: new Date(),
  });

  return { cuttingOrder: completed, shortages };
}

export interface CorrectCuttingFactResult extends CuttingFactResult {
  /** Что именно изменилось — для записи в журнал изменений. */
  corrections: Array<{ materialId: string; before: number; after: number; delta: number }>;
}

// Исправление уже внесённого факта (владелец проекта, 2026-08-30: «нельзя
// молча переписывать историю»). Прежнее движение по складу не трогается —
// проводится отдельная корректировка на разницу, а вызывающему возвращается
// список «было → стало», который он кладёт в журнал изменений.
export async function correctCuttingFact(
  deps: CuttingFactDeps,
  input: CuttingFactInput,
): Promise<CorrectCuttingFactResult> {
  const order = await deps.cuttingOrders.findById(input.companyId, input.cuttingOrderId);
  if (!order) {
    throw new DomainError(`Раскройное задание ${input.cuttingOrderId} не найдено`, "CUTTING_ORDER_NOT_FOUND");
  }
  assertCanCorrectResult(order.status);
  validate(input, order);

  const previous = new Map(
    order.materials.map((row) => [row.materialId, row.consumedQuantity === null ? 0 : Number(row.consumedQuantity)]),
  );

  const corrections: CorrectCuttingFactResult["corrections"] = [];
  const shortages: StockShortage[] = [];
  for (const row of input.materials) {
    const before = previous.get(row.materialId) ?? 0;
    const after = row.consumedQuantity;
    // Разница по расходу: израсходовали больше — со склада уходит ещё, меньше
    // — материал возвращается. Знак корректировки остатка обратен знаку
    // изменения расхода.
    const delta = before - after;
    if (Math.abs(delta) < 0.0005) continue;

    corrections.push({ materialId: row.materialId, before, after, delta: after - before });
    if (delta < 0) {
      const onHand = await deps.materialStock.quantityOnHand(input.warehouseId, row.materialId);
      if (onHand < -delta) {
        shortages.push({
          materialId: row.materialId,
          onHandBefore: onHand,
          consumed: -delta,
          shortage: -delta - onHand,
        });
      }
    }
    await deps.materialStock.adjust(input.warehouseId, row.materialId, delta, {
      referenceType: CUTTING_REFERENCE_TYPE,
      referenceId: order.id,
      createdBy: input.recordedBy ?? null,
    });
  }

  const updated = await deps.cuttingOrders.recordFact(order.id, input.materials, input.results);
  return { cuttingOrder: updated, shortages, corrections };
}
