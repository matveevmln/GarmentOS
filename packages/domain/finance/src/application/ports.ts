import type { CostEntry } from "../domain/cost-entry";
import type { Transaction, TransactionType } from "../domain/transaction";
import type { Invoice, InvoiceStatus } from "../domain/invoice";

export interface NewCostEntryInput {
  companyId: string;
  productVariantId: string;
  productionOrderId: string | null;
  materialCost: number;
  manufacturingCost: number;
  logisticsCost: number;
  overheadCost: number;
}

export interface CostEntryRepository {
  create(input: NewCostEntryInput): Promise<CostEntry>;
}

export interface NewTransactionInput {
  companyId: string;
  type: TransactionType;
  amount: number;
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: Date;
}

export interface TransactionRepository {
  create(input: NewTransactionInput): Promise<Transaction>;
}

export interface NewInvoiceInput {
  companyId: string;
  orderId: string | null;
  purchaseOrderId: string | null;
  productionOrderId: string | null;
  status: InvoiceStatus;
  amount: number;
  dueDate: string | null;
}

export interface InvoiceRepository {
  create(input: NewInvoiceInput): Promise<Invoice>;
  findById(companyId: string, id: string): Promise<Invoice | null>;
  updateStatus(id: string, status: InvoiceStatus): Promise<Invoice>;
}
