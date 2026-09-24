import { DomainError } from "../domain/errors";
import { assertCanUpdateDraft, type SewingOrder, type SewingOrderDraftPayload } from "../domain/sewing-order";
import type { SewingOrderRepository } from "./ports";

export interface UpdateSewingOrderDraftInput {
  companyId: string;
  sewingOrderId: string;
  expectedVersion: number;
  workshopId?: string | null;
  draftPayload?: SewingOrderDraftPayload | null;
}

export interface UpdateSewingOrderDraftDeps {
  sewingOrders: SewingOrderRepository;
}

// Автосохранение формы A02 (ADR 0002) — только для status='draft'. Версия
// проверяется атомарно в самом UPDATE (SewingOrderRepository.updateDraft):
// если она не совпала, конфликт возвращается по актуальному прочитанному
// состоянию, а не по догадке — так поздний ответ автосохранения после уже
// размещённого заказа (status='placed') тоже получает понятную причину
// отказа, а не «версия не совпала» без объяснения.
export async function updateSewingOrderDraft(
  deps: UpdateSewingOrderDraftDeps,
  input: UpdateSewingOrderDraftInput,
): Promise<SewingOrder> {
  const current = await deps.sewingOrders.findById(input.companyId, input.sewingOrderId);
  if (!current) {
    throw new DomainError(`Заказ на пошив ${input.sewingOrderId} не найден в этой компании`, "SEWING_ORDER_NOT_FOUND");
  }
  assertCanUpdateDraft(current.status);

  const updated = await deps.sewingOrders.updateDraft(input.sewingOrderId, input.expectedVersion, {
    workshopId: input.workshopId,
    draftPayload: input.draftPayload,
  });
  if (!updated) {
    // Гонка/конфликт версии между чтением выше и записью — перечитываем
    // актуальное состояние, чтобы сообщение содержало настоящую текущую
    // версию, а не ту, что читалась до этого момента.
    const latest = await deps.sewingOrders.findById(input.companyId, input.sewingOrderId);
    throw new DomainError(
      `Заказ на пошив изменён в другой вкладке (ожидалась версия ${input.expectedVersion}, сейчас ${latest?.version ?? "?"}) — обновите страницу`,
      "SEWING_ORDER_VERSION_CONFLICT",
    );
  }
  return updated;
}
