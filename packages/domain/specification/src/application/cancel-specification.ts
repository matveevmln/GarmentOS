import { DomainError } from "../domain/errors";
import { assertCanEdit, assertIsDraft, type Specification } from "../domain/specification";
import type { SpecificationRepository } from "./ports";

export interface CancelSpecificationInput {
  companyId: string;
  specificationId: string;
}

export interface CancelSpecificationDeps {
  specifications: SpecificationRepository;
}

// Изначально (ПРОМПТ №3) — только NEW-поток. Расширено аудитом
// пользовательского пути (owner, 2026-09-21): у LEGACY-черновика (создан
// мастером СпецификацииDetailPage, ещё не утверждён — не относится к какому-
// либо заказу) не было ни одного действия, кроме «Утвердить» — передумавший
// пользователь не мог ни отменить, ни удалить ошибочный черновик, тот
// оставался в списке навсегда. Утверждённые LEGACY-спецификации по-прежнему
// нельзя отменить этой функцией (assertIsDraft бросит ошибку) — это
// сознательно: они уже могли породить производственные партии
// (production_orders.specification_id), отмена задним числом их не
// разорвала бы и стала бы вводящей в заблуждение.
export async function cancelSpecification(deps: CancelSpecificationDeps, input: CancelSpecificationInput): Promise<Specification> {
  const spec = await deps.specifications.findById(input.companyId, input.specificationId);
  if (!spec) {
    throw new DomainError(`Спецификация ${input.specificationId} не найдена`, "SPECIFICATION_NOT_FOUND");
  }
  if (spec.productionOrderId) {
    assertCanEdit(spec.status);
  } else {
    assertIsDraft(spec.status);
  }

  return deps.specifications.cancel(input.companyId, spec.id);
}
