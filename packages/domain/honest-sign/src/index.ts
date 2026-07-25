// Публичный интерфейс модуля Honest Sign (docs/REPOSITORY_STRUCTURE.md).

export type { MarkingCode, MarkingCodeStatus } from "./domain/marking-code";
export type { MarkingCodeEvent } from "./domain/marking-code-event";
export { DomainError } from "./domain/errors";

export type { MarkingCodeRepository, MarkingCodeTransitionEvent, NewMarkingCodeInput } from "./application/ports";
export { issueMarkingCode, type IssueMarkingCodeDeps, type IssueMarkingCodeInput } from "./application/issue-marking-code";
export {
  applyMarkingCode,
  introduceMarkingCode,
  retireMarkingCode,
  type RetireMarkingCodeInput,
  type TransitionMarkingCodeDeps,
  type TransitionMarkingCodeInput,
} from "./application/transition-marking-code";

export { DrizzleMarkingCodeRepository } from "./infrastructure/drizzle-honest-sign-repository";
