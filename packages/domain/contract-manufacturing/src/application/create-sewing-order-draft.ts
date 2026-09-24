import type { SewingOrder, SewingOrderDraftPayload } from "../domain/sewing-order";
import type { SewingOrderRepository } from "./ports";

export interface CreateSewingOrderDraftInput {
  companyId: string;
  workshopId?: string | null;
  draftPayload?: SewingOrderDraftPayload | null;
  createdBy?: string | null;
}

export interface CreateSewingOrderDraftDeps {
  sewingOrders: SewingOrderRepository;
}

// Создаёт пустой (или частично заполненный) черновик заказа на пошив —
// A02 «Сохранить черновик» (ADR 0002). Допускает неполные данные: без цеха,
// без единой модели — размещение (placeSewingOrder) проверяет минимум само.
export async function createSewingOrderDraft(
  deps: CreateSewingOrderDraftDeps,
  input: CreateSewingOrderDraftInput,
): Promise<SewingOrder> {
  return deps.sewingOrders.create({
    companyId: input.companyId,
    workshopId: input.workshopId ?? null,
    draftPayload: input.draftPayload ?? null,
    createdBy: input.createdBy ?? null,
  });
}
