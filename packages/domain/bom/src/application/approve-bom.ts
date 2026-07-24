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

export async function approveBom(deps: ApproveBomDeps, input: ApproveBomInput): Promise<Bom> {
  const bom = await deps.boms.findById(input.companyId, input.bomId);
  if (!bom) {
    throw new DomainError(`BOM ${input.bomId} не найден в этой компании`, "BOM_NOT_FOUND");
  }
  assertCanApprove(bom.status);

  return deps.boms.updateStatus(bom.id, "approved");
}
