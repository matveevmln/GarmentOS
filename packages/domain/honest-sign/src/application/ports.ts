import type { MarkingCode, MarkingCodeStatus } from "../domain/marking-code";

export interface NewMarkingCodeInput {
  companyId: string;
  productVariantId: string;
  codeValue: string;
  productionOrderId: string | null;
}

export interface MarkingCodeTransitionEvent {
  eventType: string;
  referenceType?: string | null;
  referenceId?: string | null;
  payloadJson?: unknown;
}

export interface MarkingCodeRepository {
  create(input: NewMarkingCodeInput): Promise<MarkingCode>;
  findById(companyId: string, id: string): Promise<MarkingCode | null>;
  findByCodeValue(codeValue: string): Promise<MarkingCode | null>;
  // Меняет статус И пишет событие в marking_code_events одной транзакцией —
  // в этом домене статус без события в истории не имеет смысла (комплаенс
  // ГИС МТ требует полного следа, не только текущего значения).
  transition(id: string, status: MarkingCodeStatus, event: MarkingCodeTransitionEvent): Promise<MarkingCode>;
}
