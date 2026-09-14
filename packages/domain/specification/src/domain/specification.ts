import { DomainError } from "./errors";

// Спецификация — самостоятельная бизнес-сущность, первый шаг производства
// (владелец проекта, 2026-09-11 — «Production Master»): создаётся ДО
// производственной партии, утверждается, и только тогда партия может
// на неё сослаться. PDF — представление уже сохранённой спецификации,
// не источник истины (см. snapshotJson ниже).
export type SpecificationStatus = "draft" | "approved" | "cancelled";

// Предоплата зафиксирована на 70% (владелец проекта, критическое
// требование №7) — не настройка на этом этапе. Если бизнес-правило
// изменится, единственное место правки — эта константа плюс, при
// необходимости, колонка на цехе/компании (сейчас сознательно не заводится).
export const SPECIFICATION_PREPAYMENT_PERCENT = 70;

export interface SpecificationItem {
  id: string;
  specificationId: string;
  productVariantId: string;
  quantity: string;
  unitPrice: string;
  sum: string;
  sortOrder: number;
}

export interface SpecificationItemDraft {
  productVariantId: string;
  quantity: number;
  unitPrice: number;
}

export interface Specification {
  id: string;
  companyId: string;
  workshopId: string;
  productId: string;
  specNumber: number | null;
  status: SpecificationStatus;
  version: number;
  basedOnSpecificationId: string | null;
  deliveryDeadline: string | null;
  totalQuantity: string;
  totalSum: string;
  totalSumCurrency: string;
  prepaymentAmount: string | null;
  snapshotJson: Record<string, unknown> | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: SpecificationItem[];
}

// Данные, застывающие в snapshotJson при approve (требование №4, №9, №10) —
// собирается на уровне apps/api (композиция чужих модулей — Workshop/
// Product/Company — здесь недоступна, docs/PRINCIPLES.md принцип 2), домен
// только принимает уже готовый объект и хранит его неизменным.
export interface SpecificationSnapshot {
  product: { name: string; code: string };
  workshop: {
    contractNumber: string | null;
    contractDate: string | null;
    paymentTerms: string | null;
    deliveryMethod: string | null;
    legalAddress: string | null;
    signerRole: string | null;
    signerName: string | null;
    name: string;
  };
  company: { legalName: string; signerName: string | null };
  items: Array<{ name: string; unit: string; size: string; quantity: string; unitPrice: string; sum: string }>;
  totals: { quantity: string; sum: string };
  prepaymentAmount: string;
  prepaymentPercent: number;
  deliveryDeadline: string | null;
}

export function assertHasItems(items: SpecificationItemDraft[]): void {
  if (items.length === 0) {
    throw new DomainError("Спецификация должна содержать хотя бы одну строку", "SPECIFICATION_EMPTY");
  }
}

export function assertValidItem(item: SpecificationItemDraft): void {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    throw new DomainError(
      `Количество в строке спецификации должно быть положительным (получено ${item.quantity})`,
      "SPECIFICATION_ITEM_QUANTITY_INVALID",
    );
  }
  if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
    throw new DomainError(
      `Цена в строке спецификации не может быть отрицательной (получено ${item.unitPrice})`,
      "SPECIFICATION_ITEM_PRICE_INVALID",
    );
  }
}

// Утверждение — необратимый коммит (требование №9): доступно только для
// черновика. Утверждённую или отменённую спецификацию нельзя утвердить
// повторно — любое изменение делается созданием НОВОЙ спецификации, не
// повторным approve этой же строки.
export function assertCanApprove(status: SpecificationStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Нельзя утвердить спецификацию в статусе "${status}" — утверждение доступно только для черновика`,
      "SPECIFICATION_NOT_DRAFT",
    );
  }
}

// Правка строк/основных полей — только пока черновик (требование №9:
// "После APPROVED: нельзя редактировать; нельзя менять строки..."). Тот же
// инвариант защищает и отмену черновика.
export function assertIsDraft(status: SpecificationStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Спецификация в статусе "${status}" больше не редактируется — любое изменение оформляется новой спецификацией`,
      "SPECIFICATION_NOT_EDITABLE",
    );
  }
}

// Округление до копеек — единственное место, где деньги округляются перед
// сохранением (numeric(14,2)); сравнения/валидация выше по стеку работают с
// точными числами до этой точки.
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ComputedSpecificationTotals {
  totalQuantity: number;
  totalSum: number;
  items: Array<SpecificationItemDraft & { sum: number }>;
}

// Расчёт сумм строк и итогов — backend-only (владелец проекта: "не
// заставлять пользователя считать это вручную", "не доверять значениям,
// рассчитанным только на frontend"). Сумма строки не принимается от клиента
// нигде выше по стеку — только пересчитывается здесь.
export function computeSpecificationTotals(items: SpecificationItemDraft[]): ComputedSpecificationTotals {
  const computedItems = items.map((item) => ({ ...item, sum: roundMoney(item.quantity * item.unitPrice) }));
  const totalQuantity = computedItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalSum = roundMoney(computedItems.reduce((sum, item) => sum + item.sum, 0));
  return { totalQuantity, totalSum, items: computedItems };
}

// Предоплата 70% от итоговой суммы (требование №7) — считается один раз, в
// момент approve, от уже зафиксированной на этот момент суммы.
export function computePrepaymentAmount(totalSum: number): number {
  return roundMoney(totalSum * (SPECIFICATION_PREPAYMENT_PERCENT / 100));
}
