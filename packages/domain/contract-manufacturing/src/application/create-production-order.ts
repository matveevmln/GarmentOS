import { DomainError } from "../domain/errors";
import {
  assertBomIsApproved,
  assertHasVariants,
  assertValidPlannedQuantity,
  assertValidUnitPrice,
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
  assertValidPlannedQuantity(input.plannedQuantity);
  assertValidUnitPrice(input.agreedUnitPrice);

  const workshop = await deps.workshops.findById(input.companyId, input.workshopId);
  if (!workshop) {
    throw new DomainError(`Цех ${input.workshopId} не найден в этой компании`, "WORKSHOP_NOT_FOUND");
  }

  const bomApproved = await deps.bomApproval.isBomApproved(input.companyId, input.bomId, input.productId);
  assertBomIsApproved(bomApproved, input.bomId);

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
  });
}
