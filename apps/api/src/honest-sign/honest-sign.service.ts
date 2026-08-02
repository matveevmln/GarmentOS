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
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { MARKING_CODE_REPOSITORY } from "./honest-sign.tokens";

// Тонкий presentation-адаптер поверх packages/domain/honest-sign
// (docs/ARCHITECTURE.md, раздел 2) — репозиторий внедряется через DI по
// токену доменного порта.
//
// Аудит (Итерация 6): marking_code_events (домен honest-sign) уже хранит
// полную историю переходов статуса для комплаенса ГИС МТ, но не фиксирует,
// кто из пользователей выполнил переход — только сам факт и контекст
// (referenceType/referenceId). Каждый переход дополнительно пишется в общий
// audit_log с userId/source — этого домену не хватало для docs/ARCHITECTURE.md,
// раздел 7 ("списание кодов маркировки" — явно названный пример).
@Injectable()
export class HonestSignService {
  constructor(
    @Inject(MARKING_CODE_REPOSITORY) private readonly markingCodes: MarkingCodeRepository,
    private readonly auditService: AuditService,
  ) {}

  async issue(currentUser: AuthenticatedRequestUser, input: IssueMarkingCodeDto): Promise<MarkingCode> {
    const markingCode = await issueMarkingCode(
      { markingCodes: this.markingCodes },
      { ...input, companyId: currentUser.companyId },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "marking_code",
      entityId: markingCode.id,
      action: "honest_sign.issue",
      afterJson: { status: markingCode.status, codeValue: markingCode.codeValue },
    });
    return markingCode;
  }

  async apply(
    currentUser: AuthenticatedRequestUser,
    markingCodeId: string,
    input: TransitionMarkingCodeDto,
  ): Promise<MarkingCode> {
    return this.transition(currentUser, markingCodeId, "honest_sign.apply", (companyId) =>
      applyMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId, markingCodeId }),
    );
  }

  async introduce(
    currentUser: AuthenticatedRequestUser,
    markingCodeId: string,
    input: TransitionMarkingCodeDto,
  ): Promise<MarkingCode> {
    return this.transition(currentUser, markingCodeId, "honest_sign.introduce", (companyId) =>
      introduceMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId, markingCodeId }),
    );
  }

  async retire(
    currentUser: AuthenticatedRequestUser,
    markingCodeId: string,
    input: RetireMarkingCodeDto,
  ): Promise<MarkingCode> {
    return this.transition(currentUser, markingCodeId, "honest_sign.retire", (companyId) =>
      retireMarkingCode({ markingCodes: this.markingCodes }, { ...input, companyId, markingCodeId }),
    );
  }

  private async transition(
    currentUser: AuthenticatedRequestUser,
    markingCodeId: string,
    action: string,
    run: (companyId: string) => Promise<MarkingCode>,
  ): Promise<MarkingCode> {
    const before = await this.markingCodes.findById(currentUser.companyId, markingCodeId);
    const markingCode = await run(currentUser.companyId);
    await this.auditService.recordForUser(currentUser, {
      entityType: "marking_code",
      entityId: markingCode.id,
      action,
      beforeJson: before ? { status: before.status } : null,
      afterJson: { status: markingCode.status },
    });
    return markingCode;
  }
}
