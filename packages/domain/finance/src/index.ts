// Публичный интерфейс модуля Finance (docs/REPOSITORY_STRUCTURE.md).

export type { CostEntry } from "./domain/cost-entry";
export type { Transaction, TransactionType } from "./domain/transaction";
export type { Invoice, InvoiceStatus } from "./domain/invoice";
export { DomainError } from "./domain/errors";

export type {
  CostEntryRepository,
  InvoiceRepository,
  NewCostEntryInput,
  NewInvoiceInput,
  NewTransactionInput,
  TransactionRepository,
} from "./application/ports";

export { recordCostEntry, type RecordCostEntryDeps, type RecordCostEntryInput } from "./application/record-cost-entry";
export { recordTransaction, type RecordTransactionDeps, type RecordTransactionInput } from "./application/record-transaction";
export { createInvoice, type CreateInvoiceDeps, type CreateInvoiceInput } from "./application/create-invoice";
export {
  cancelInvoice,
  issueInvoice,
  markInvoiceOverdue,
  markInvoicePaid,
  type TransitionInvoiceStatusDeps,
  type TransitionInvoiceStatusInput,
} from "./application/transition-invoice-status";

export {
  DrizzleCostEntryRepository,
  DrizzleInvoiceRepository,
  DrizzleTransactionRepository,
} from "./infrastructure/drizzle-finance-repository";
