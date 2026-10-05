import { assertValidWorkshopName, type Workshop } from "../domain/workshop";
import { DomainError } from "../domain/errors";
import type { WorkshopPatch, WorkshopRepository } from "./ports";

export interface UpdateWorkshopInput extends WorkshopPatch {
  companyId: string;
  workshopId: string;
}

export interface UpdateWorkshopDeps {
  workshops: WorkshopRepository;
}

// Пустая строка означает «очистить поле», отсутствие поля — «не менять».
// Тот же trim, что и в createWorkshop: между "  " и "" разницы нет, оба
// приводятся к null, иначе в карточке цеха оседают пробелы, которые потом
// попадут в спецификацию как значимое значение.
function normalize(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Реквизиты необязательны для создания партии (ADR 0004).
// Архив и восстановление меняют только доступность для новых партий.
//
// Уже подтверждённые заказы правка НЕ затрагивает: их реквизиты
// зафиксированы в Snapshot партии в момент подтверждения
// (docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, раздел 26) и не
// перечитываются из карточки цеха никогда.
export async function updateWorkshop(deps: UpdateWorkshopDeps, input: UpdateWorkshopInput): Promise<Workshop> {
  const { companyId, workshopId, ...patch } = input;

  const existing = await deps.workshops.findById(companyId, workshopId);
  if (!existing) {
    throw new DomainError(`Цех ${workshopId} не найден в этой компании`, "WORKSHOP_NOT_FOUND");
  }

  if (patch.name !== undefined) {
    assertValidWorkshopName(patch.name);
  }

  return deps.workshops.update(workshopId, {
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    inn: normalize(patch.inn),
    contactInfo: normalize(patch.contactInfo),
    specialization: normalize(patch.specialization),
    contractNumber: normalize(patch.contractNumber),
    contractDate: normalize(patch.contractDate),
    paymentTerms: normalize(patch.paymentTerms),
    deliveryMethod: normalize(patch.deliveryMethod),
    signerRole: normalize(patch.signerRole),
    signerName: normalize(patch.signerName),
    legalAddress: normalize(patch.legalAddress),
  });
}
