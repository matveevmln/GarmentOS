import { DomainError } from "./errors";

export type MarkingCodeStatus = "issued" | "applied" | "introduced" | "sold" | "retired" | "damaged";

// Код маркировки «Честный Знак» — уникальный DataMatrix-код единицы товара
// (docs/DATABASE_SCHEMA.md, раздел 13; CLAUDE.md, глоссарий). Обязанность по
// маркировке лежит на нас как на продавце/импортёре — актуальна независимо
// от того, что мы не производитель (см. комментарий в схеме).
export interface MarkingCode {
  id: string;
  companyId: string;
  productVariantId: string;
  codeValue: string;
  status: MarkingCodeStatus;
  productionOrderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidCodeValue(codeValue: string): void {
  if (codeValue.trim().length === 0) {
    throw new DomainError("Код маркировки не может быть пустым", "MARKING_CODE_VALUE_REQUIRED");
  }
}

// Легальный жизненный цикл кода — линейный до вывода из оборота, без
// пропуска шагов (docs/DATABASE_SCHEMA.md, раздел 13): нельзя продать код,
// который не был "введён в оборот", нельзя ввести в оборот неприменённый.
const ALLOWED_TRANSITIONS: Record<MarkingCodeStatus, MarkingCodeStatus[]> = {
  issued: ["applied"],
  applied: ["introduced"],
  introduced: ["sold", "retired", "damaged"],
  sold: [],
  retired: [],
  damaged: [],
};

export function assertValidTransition(from: MarkingCodeStatus, to: MarkingCodeStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      `Недопустимый переход статуса кода маркировки: "${from}" → "${to}"`,
      "MARKING_CODE_INVALID_STATUS_TRANSITION",
    );
  }
}
