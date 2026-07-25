import { DomainError } from "../domain/errors";
import { assertValidTransition, type MarkingCode, type MarkingCodeStatus } from "../domain/marking-code";
import type { MarkingCodeRepository } from "./ports";

export interface TransitionMarkingCodeInput {
  companyId: string;
  markingCodeId: string;
  referenceType?: string;
  referenceId?: string;
}

export interface TransitionMarkingCodeDeps {
  markingCodes: MarkingCodeRepository;
}

async function transition(
  deps: TransitionMarkingCodeDeps,
  input: TransitionMarkingCodeInput,
  to: MarkingCodeStatus,
): Promise<MarkingCode> {
  const code = await deps.markingCodes.findById(input.companyId, input.markingCodeId);
  if (!code) {
    throw new DomainError(`Код маркировки ${input.markingCodeId} не найден в этой компании`, "MARKING_CODE_NOT_FOUND");
  }
  assertValidTransition(code.status, to);

  return deps.markingCodes.transition(code.id, to, {
    eventType: to,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
  });
}

// applied — код физически нанесён/применён к единице товара.
export const applyMarkingCode = (deps: TransitionMarkingCodeDeps, input: TransitionMarkingCodeInput) =>
  transition(deps, input, "applied");

// introduced — товар введён в оборот (легальная продажа возможна только после этого).
export const introduceMarkingCode = (deps: TransitionMarkingCodeDeps, input: TransitionMarkingCodeInput) =>
  transition(deps, input, "introduced");

export interface RetireMarkingCodeInput extends TransitionMarkingCodeInput {
  reason: "sold" | "retired" | "damaged";
}

// Вывод кода из оборота — при продаже (sold), возврате/списании (retired)
// или повреждении (damaged). Три разных терминальных исхода одного и того
// же жизненного события "код больше не активен" (docs/DATABASE_SCHEMA.md,
// раздел 13).
export async function retireMarkingCode(
  deps: TransitionMarkingCodeDeps,
  input: RetireMarkingCodeInput,
): Promise<MarkingCode> {
  return transition(deps, input, input.reason);
}
