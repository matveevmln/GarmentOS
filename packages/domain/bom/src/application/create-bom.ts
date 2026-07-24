import { assertHasItems, assertValidItem, type Bom, type BomItemDraft } from "../domain/bom";
import type { BomRepository } from "./ports";

export interface CreateBomDraftInput {
  companyId: string;
  productId: string;
  items: BomItemDraft[];
  createdBy?: string;
}

export interface CreateBomDraftDeps {
  boms: BomRepository;
}

// Создаёт новую версию BOM для модели как черновик. Версия — следующая по
// счёту для этой модели (docs/DATABASE_SCHEMA.md, раздел 7: boms.version) —
// предыдущие версии (в т.ч. approved/archived) не затрагиваются.
export async function createBomDraft(deps: CreateBomDraftDeps, input: CreateBomDraftInput): Promise<Bom> {
  assertHasItems(input.items);
  for (const item of input.items) assertValidItem(item);

  const existingCount = await deps.boms.countByProduct(input.companyId, input.productId);

  return deps.boms.create({
    companyId: input.companyId,
    productId: input.productId,
    version: existingCount + 1,
    status: "draft",
    createdBy: input.createdBy ?? null,
    items: input.items,
  });
}
