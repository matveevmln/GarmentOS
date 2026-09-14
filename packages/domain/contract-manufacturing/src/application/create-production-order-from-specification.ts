import { DomainError } from "../domain/errors";
import {
  assertBomIsApproved,
  assertHasVariants,
  assertValidPlannedQuantity,
  assertValidUnitPrice,
  assertValidVariant,
  assertVariantsMatchPlannedQuantity,
  type ProductionOrder,
  type ProductionOrderVariantDraft,
} from "../domain/production-order";
import type { BomApprovalPort, ProductionOrderRepository, WorkshopRepository } from "./ports";

export interface CreateProductionOrderFromSpecificationInput {
  companyId: string;
  productId: string;
  bomId: string;
  workshopId: string;
  plannedQuantity: number;
  agreedUnitPrice: number;
  materialsProvidedByUs?: boolean;
  dueDate?: string | null;
  variants: ProductionOrderVariantDraft[];
  createdBy?: string | null;
  // Опаковые для этого домена (docs/PRINCIPLES.md, принцип 2) — Contract
  // Manufacturing не знает структуры спецификации, только хранит ссылку и
  // уже готовый номер/снимок, вычисленные вызывающим кодом (apps/api).
  specificationId: string;
  orderNumber: number;
  costSnapshot: Record<string, unknown>;
}

export interface CreateProductionOrderFromSpecificationDeps {
  productionOrders: ProductionOrderRepository;
  workshops: WorkshopRepository;
  bomApproval: BomApprovalPort;
}

// Создание производственной партии из утверждённой спецификации (Этап 3
// «Production Master», владелец проекта, 2026-09-12) — отдельная функция от
// createProductionOrderDraft (не переиспользует её сигнатуру), но повторно
// использует ВСЕ те же доменные инварианты (сумма по размерам, approved BOM,
// корректность вариантов/цены) — бизнес-правила не дублируются, только
// орхестрация вокруг них другая: партия создаётся СРАЗУ в статусе "placed"
// (auto-confirm, владелец проекта: "отдельная кнопка «Подтвердить» для этого
// сценария НЕ нужна"), с уже готовым cost_snapshot (Вариант B — коммерческие
// поля из snapshot спецификации, технологические из approved BOM), не
// требуя отдельного шага captureProductionOrderCostSnapshot.
export async function createProductionOrderFromSpecification(
  deps: CreateProductionOrderFromSpecificationDeps,
  input: CreateProductionOrderFromSpecificationInput,
): Promise<ProductionOrder> {
  assertHasVariants(input.variants);
  for (const variant of input.variants) assertValidVariant(variant);
  assertValidPlannedQuantity(input.plannedQuantity);
  assertVariantsMatchPlannedQuantity(input.variants, input.plannedQuantity);
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
    status: "placed",
    dueDate: input.dueDate ?? null,
    createdBy: input.createdBy ?? null,
    variants: input.variants,
    sourceProductionOrderId: null,
    specificationId: input.specificationId,
    orderNumber: input.orderNumber,
    costSnapshot: input.costSnapshot,
  });
}
