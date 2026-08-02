import { DomainError } from "../domain/errors";
import { assertHasItems, assertValidItem, type PurchaseOrder, type PurchaseOrderItemDraft } from "../domain/purchase-order";
import type { PurchaseOrderRepository, SupplierRepository } from "./ports";

export interface CreatePurchaseOrderInput {
  companyId: string;
  supplierId: string;
  items: PurchaseOrderItemDraft[];
  orderedAt?: string;
  expectedDate?: string;
  createdBy?: string;
}

export interface CreatePurchaseOrderDeps {
  purchaseOrders: PurchaseOrderRepository;
  suppliers: SupplierRepository;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Создаёт закупку как черновик (status='draft') — это тот же путь, которым
// Inbox создаёт черновик закупки из распознанного инвойса/прайс-листа
// (docs/INBOX_ARCHITECTURE.md, раздел 3): draft ничего не резервирует и не
// проводит, подтверждение — отдельный шаг (confirmPurchaseOrder).
export async function createPurchaseOrderDraft(
  deps: CreatePurchaseOrderDeps,
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  assertHasItems(input.items);
  for (const item of input.items) assertValidItem(item);

  const supplier = await deps.suppliers.findById(input.companyId, input.supplierId);
  if (!supplier) {
    throw new DomainError(`Поставщик ${input.supplierId} не найден в этой компании`, "SUPPLIER_NOT_FOUND");
  }

  return deps.purchaseOrders.create({
    companyId: input.companyId,
    supplierId: input.supplierId,
    status: "draft",
    orderedAt: input.orderedAt ?? today(),
    expectedDate: input.expectedDate ?? null,
    createdBy: input.createdBy ?? null,
    items: input.items,
  });
}
