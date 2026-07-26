import { DomainError } from "../domain/errors";
import type { Workshop } from "../domain/workshop";
import type { WorkshopRepository } from "./ports";

export interface LinkWorkshopTelegramChatInput {
  companyId: string;
  workshopId: string;
  telegramChatId: string;
}

export interface LinkWorkshopTelegramChatDeps {
  workshops: WorkshopRepository;
}

// Вызывается при переходе цеха по инвайт-ссылке (docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md,
// раздел 1-2) — только после этого шага бот может проактивно отправлять цеху
// PDF-спецификации (ограничение Telegram Bot API, раздел 4 того же документа).
export async function linkWorkshopTelegramChat(
  deps: LinkWorkshopTelegramChatDeps,
  input: LinkWorkshopTelegramChatInput,
): Promise<Workshop> {
  const workshop = await deps.workshops.findById(input.companyId, input.workshopId);
  if (!workshop) {
    throw new DomainError(`Цех ${input.workshopId} не найден в этой компании`, "WORKSHOP_NOT_FOUND");
  }
  return deps.workshops.setTelegramChatId(workshop.id, input.telegramChatId);
}
