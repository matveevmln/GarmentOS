import { DomainError } from "../domain/errors";
import { assertValidCodeValue, type MarkingCode } from "../domain/marking-code";
import type { MarkingCodeRepository } from "./ports";

export interface IssueMarkingCodeInput {
  companyId: string;
  productVariantId: string;
  codeValue: string;
  productionOrderId?: string;
}

export interface IssueMarkingCodeDeps {
  markingCodes: MarkingCodeRepository;
}

export async function issueMarkingCode(deps: IssueMarkingCodeDeps, input: IssueMarkingCodeInput): Promise<MarkingCode> {
  const codeValue = input.codeValue.trim();
  assertValidCodeValue(codeValue);

  const existing = await deps.markingCodes.findByCodeValue(codeValue);
  if (existing) {
    throw new DomainError(`Код маркировки "${codeValue}" уже выпущен`, "MARKING_CODE_ALREADY_ISSUED");
  }

  return deps.markingCodes.create({
    companyId: input.companyId,
    productVariantId: input.productVariantId,
    codeValue,
    productionOrderId: input.productionOrderId ?? null,
  });
}
