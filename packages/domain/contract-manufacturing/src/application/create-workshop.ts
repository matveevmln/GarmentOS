import { assertValidWorkshopName, type Workshop, type WorkshopStatus } from "../domain/workshop";
import type { WorkshopRepository } from "./ports";

export interface CreateWorkshopInput {
  companyId: string;
  name: string;
  inn?: string;
  contactInfo?: string;
  specialization?: string;
  // По умолчанию 'active' (человек создаёт цех осознанно); Inbox передаёт
  // 'draft' явно при первом упоминании незнакомого цеха в сообщении
  // (docs/INBOX_ARCHITECTURE.md, раздел 2.1) — тот же use case для AI и
  // человека (PRINCIPLES.md, принцип 15).
  status?: WorkshopStatus;
  // Рамочный договор с цехом — если ещё не заключён/не введён, остаётся
  // пустым (не изобретается); спецификации нумеруются относительно него.
  contractNumber?: string;
  contractDate?: string;
  createdBy?: string;
}

export interface CreateWorkshopDeps {
  workshops: WorkshopRepository;
}

export async function createWorkshop(deps: CreateWorkshopDeps, input: CreateWorkshopInput): Promise<Workshop> {
  const name = input.name.trim();
  assertValidWorkshopName(name);

  return deps.workshops.create({
    companyId: input.companyId,
    name,
    inn: input.inn?.trim() ?? null,
    contactInfo: input.contactInfo?.trim() ?? null,
    specialization: input.specialization?.trim() ?? null,
    status: input.status ?? "active",
    contractNumber: input.contractNumber?.trim() ?? null,
    contractDate: input.contractDate?.trim() ?? null,
    createdBy: input.createdBy ?? null,
  });
}
