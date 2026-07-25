import { Inject, Injectable } from "@nestjs/common";
import {
  applyMarkingCode,
  introduceMarkingCode,
  issueMarkingCode,
  retireMarkingCode,
  type MarkingCode,
  type MarkingCodeRepository,
} from "@garmentos/domain-honest-sign";
import type { IssueMarkingCodeDto, RetireMarkingCodeDto, TransitionMarkingCodeDto } from "@garmentos/shared-types";
import { MARKING_CODE_REPOSITORY } from "./honest-sign.tokens";

// Тонкий presentation-адаптер поверх packages/domain/honest-sign
// (docs/ARCHITECTURE.md, раздел 2) — репозиторий внедряется через DI по
// токену доменного порта.
@Injectable()
export class HonestSignService {
  constructor(@Inject(MARKING_CODE_REPOSITORY) private readonly markingCodes: MarkingCodeRepository) {}

  async issue(companyId: string, input: IssueMarkingCodeDto): Promise<MarkingCode> {
    return issueMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId });
  }

  async apply(companyId: string, markingCodeId: string, input: TransitionMarkingCodeDto): Promise<MarkingCode> {
    return applyMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId, markingCodeId });
  }

  async introduce(companyId: string, markingCodeId: string, input: TransitionMarkingCodeDto): Promise<MarkingCode> {
    return introduceMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId, markingCodeId });
  }

  async retire(companyId: string, markingCodeId: string, input: RetireMarkingCodeDto): Promise<MarkingCode> {
    return retireMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId, markingCodeId });
  }
}
