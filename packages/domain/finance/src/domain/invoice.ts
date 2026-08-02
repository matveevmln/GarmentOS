import { DomainError } from "./errors";

export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled";

// Счёт/инвойс — может относиться к продаже, закупке или заказу пошива
// (все три поля nullable — счёт может не быть привязан ни к чему конкретному,
// например разовая услуга, docs/DATABASE_SCHEMA.md, раздел 14).
export interface Invoice {
  id: string;
  companyId: string;
  orderId: string | null;
  purchaseOrderId: string | null;
  productionOrderId: string | null;
  status: InvoiceStatus;
  amount: string;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertNonNegativeAmount(amount: number): void {
  if (amount < 0) {
    throw new DomainError(`Сумма счёта не может быть отрицательной (получено ${amount})`, "INVOICE_AMOUNT_INVALID");
  }
}

const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ["issued", "cancelled"],
  issued: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function assertValidTransition(from: InvoiceStatus, to: InvoiceStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new DomainError(`Недопустимый переход статуса счёта: "${from}" → "${to}"`, "INVOICE_INVALID_STATUS_TRANSITION");
  }
}
