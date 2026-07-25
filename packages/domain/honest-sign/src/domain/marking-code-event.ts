// Событие в истории кода маркировки — append-only, обязательный аудит-след
// для комплаенса ГИС МТ (docs/DATABASE_SCHEMA.md, раздел 13; PRINCIPLES.md,
// принцип 12: движения — источник истины, а не только текущий статус).
export interface MarkingCodeEvent {
  id: string;
  markingCodeId: string;
  eventType: string;
  occurredAt: Date;
  referenceType: string | null;
  referenceId: string | null;
  payloadJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}
