import { DomainError } from "../domain/errors";
import { assertCanEdit, assertIsNewFlowSpecification, type Specification } from "../domain/specification";
import type { SpecificationRepository } from "./ports";

export interface CancelSpecificationInput {
  companyId: string;
  specificationId: string;
}

export interface CancelSpecificationDeps {
  specifications: SpecificationRepository;
}

// ПРОМПТ №3 — только NEW-поток; legacy cancel уже существует концептуально
// как enum-значение, но эта функция не трогает legacy-спецификации.
export async function cancelSpecification(deps: CancelSpecificationDeps, input: CancelSpecificationInput): Promise<Specification> {
  const spec = await deps.specifications.findById(input.companyId, input.specificationId);
  if (!spec) {
    throw new DomainError(`Спецификация ${input.specificationId} не найдена`, "SPECIFICATION_NOT_FOUND");
  }
  assertIsNewFlowSpecification(spec.productionOrderId);
  assertCanEdit(spec.status);

  return deps.specifications.cancel(input.companyId, spec.id);
}
