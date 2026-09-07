import { DomainError } from "../domain/errors";
import { assertCanIssue, assertNonNegativeQuantity, type CuttingOrder } from "../domain/cutting-order";
import type { CuttingOrderRepository } from "./ports";

export interface IssueCuttingOrderInput {
  companyId: string;
  cuttingOrderId: string;
  /** Сколько материала физически выделено в крой. Склад при этом не трогается. */
  allocations?: Array<{ materialId: string; allocatedQuantity: number | null; rollNote?: string | null }>;
}

export interface IssueCuttingOrderDeps {
  cuttingOrders: CuttingOrderRepository;
}

// Выдача задания в крой: план и «выделено» фиксируются, документ можно
// печатать. Склад НЕ списывается (владелец проекта, 2026-08-30) — расход
// проводится только по факту, когда крой уже произошёл.
export async function issueCuttingOrder(
  deps: IssueCuttingOrderDeps,
  input: IssueCuttingOrderInput,
): Promise<CuttingOrder> {
  const order = await deps.cuttingOrders.findById(input.companyId, input.cuttingOrderId);
  if (!order) {
    throw new DomainError(`Раскройное задание ${input.cuttingOrderId} не найдено`, "CUTTING_ORDER_NOT_FOUND");
  }
  assertCanIssue(order.status);

  const allocations = input.allocations ?? [];
  const known = new Set(order.materials.map((material) => material.materialId));
  for (const row of allocations) {
    if (!known.has(row.materialId)) {
      throw new DomainError(
        `Материал ${row.materialId} не входит в это раскройное задание`,
        "CUTTING_MATERIAL_NOT_IN_ORDER",
      );
    }
    if (row.allocatedQuantity !== null && row.allocatedQuantity !== undefined) {
      assertNonNegativeQuantity(row.allocatedQuantity, "Выделенное количество материала");
    }
  }

  if (allocations.length > 0) {
    await deps.cuttingOrders.updateAllocations(
      order.id,
      allocations.map((row) => ({
        materialId: row.materialId,
        allocatedQuantity: row.allocatedQuantity ?? null,
        rollNote: row.rollNote ?? null,
      })),
    );
  }

  return deps.cuttingOrders.updateStatus(order.id, "issued", { issuedAt: new Date() });
}
