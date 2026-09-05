import { DomainError } from "../domain/errors";
import { assertCanApprove, type Bom } from "../domain/bom";
import type { BomRepository } from "./ports";

export interface ApproveBomInput {
  companyId: string;
  bomId: string;
}

export interface ApproveBomDeps {
  boms: BomRepository;
}

// Одна модель — одна действующая версия норм (P1-1, владелец проекта,
// 2026-09-05): утверждение новой версии автоматически архивирует прежние
// approved-версии той же модели. До этой правки ничего не мешало иметь
// несколько approved одновременно — findLatestApproved просто выбирал
// максимальный номер версии, маскируя аномалию, а не предотвращая её.
export async function approveBom(deps: ApproveBomDeps, input: ApproveBomInput): Promise<Bom> {
  const bom = await deps.boms.findById(input.companyId, input.bomId);
  if (!bom) {
    throw new DomainError(`BOM ${input.bomId} не найден в этой компании`, "BOM_NOT_FOUND");
  }
  assertCanApprove(bom.status);

  const approved = await deps.boms.updateStatus(bom.id, "approved");
  await deps.boms.archiveOtherApproved(input.companyId, bom.productId, approved.id);
  return approved;
}
