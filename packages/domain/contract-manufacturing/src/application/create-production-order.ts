import { DomainError } from "../domain/errors";
import {
  assertBomIsApproved,
  assertHasVariants,
  assertReworkPriceIsZero,
  assertReworkRequiresSource,
  assertSourceOrderExists,
  assertValidPlannedQuantity,
  assertValidUnitPrice,
  assertVariantsMatchPlannedQuantity,
  assertValidVariant,
  type ProductionOrder,
  type ProductionOrderVariantDraft,
} from "../domain/production-order";
import type { BomApprovalPort, ProductionOrderRepository, WorkshopRepository } from "./ports";

export interface CreateProductionOrderInput {
  companyId: string;
  productId: string;
  bomId: string;
  workshopId: string;
  plannedQuantity: number;
  agreedUnitPrice: number;
  materialsProvidedByUs?: boolean;
  dueDate?: string;
  variants: ProductionOrderVariantDraft[];
  createdBy?: string;
  // Заказ на переделку брака — nullable, обычный заказ его не заполняет
  // (P5-1). Заказ-источник проверяется на существование в этой же компании.
  sourceProductionOrderId?: string;
}

export interface CreateProductionOrderDeps {
  productionOrders: ProductionOrderRepository;
  workshops: WorkshopRepository;
  bomApproval: BomApprovalPort;
}

// Создаёт заказ пошива как черновик (status='draft') — тот же путь, которым
// Inbox создаёт черновик заказа из подтверждённого предложения
// (docs/INBOX_ARCHITECTURE.md, раздел 2.1): "от модели до заказа в цех через
// Universal Inbox" — этот use case и есть точка, которую вызовет AI после
// one-tap-подтверждения, без отдельного пути записи для AI и человека.
export async function createProductionOrderDraft(
  deps: CreateProductionOrderDeps,
  input: CreateProductionOrderInput,
): Promise<ProductionOrder> {
  assertHasVariants(input.variants);
  for (const variant of input.variants) assertValidVariant(variant);
  for (const variant of input.variants) assertReworkPriceIsZero(variant);
  assertReworkRequiresSource(input.variants, input.sourceProductionOrderId);
  assertValidPlannedQuantity(input.plannedQuantity);
  assertVariantsMatchPlannedQuantity(input.variants, input.plannedQuantity);
  assertValidUnitPrice(input.agreedUnitPrice);

  const workshop = await deps.workshops.findById(input.companyId, input.workshopId);
  if (!workshop) {
    throw new DomainError(`Цех ${input.workshopId} не найден в этой компании`, "WORKSHOP_NOT_FOUND");
  }

  const bomApproved = await deps.bomApproval.isBomApproved(input.companyId, input.bomId, input.productId);
  assertBomIsApproved(bomApproved, input.bomId);

  if (input.sourceProductionOrderId) {
    const source = await deps.productionOrders.findById(input.companyId, input.sourceProductionOrderId);
    assertSourceOrderExists(input.sourceProductionOrderId, source !== null);
  }

  return deps.productionOrders.create({
    companyId: input.companyId,
    productId: input.productId,
    bomId: input.bomId,
    workshopId: input.workshopId,
    plannedQuantity: input.plannedQuantity,
    agreedUnitPrice: input.agreedUnitPrice,
    materialsProvidedByUs: input.materialsProvidedByUs ?? true,
    status: "draft",
    dueDate: input.dueDate ?? null,
    createdBy: input.createdBy ?? null,
    variants: input.variants,
    sourceProductionOrderId: input.sourceProductionOrderId ?? null,
  });
}
