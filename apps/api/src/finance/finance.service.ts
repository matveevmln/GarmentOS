import { Inject, Injectable } from "@nestjs/common";
import {
  cancelInvoice,
  createInvoice,
  issueInvoice,
  markInvoiceOverdue,
  markInvoicePaid,
  recordCostEntry,
  recordTransaction,
  type CostEntry,
  type CostEntryRepository,
  type Invoice,
  type InvoiceRepository,
  type Transaction,
  type TransactionRepository,
} from "@garmentos/domain-finance";
import type { CreateInvoiceDto, RecordCostEntryDto, RecordTransactionDto } from "@garmentos/shared-types";
import { COST_ENTRY_REPOSITORY, INVOICE_REPOSITORY, TRANSACTION_REPOSITORY } from "./finance.tokens";

// Тонкий presentation-адаптер поверх packages/domain/finance
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в остальных модулях.
@Injectable()
export class FinanceService {
  constructor(
    @Inject(COST_ENTRY_REPOSITORY) private readonly costEntries: CostEntryRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
  ) {}

  async recordCostEntry(input: RecordCostEntryDto): Promise<CostEntry> {
    return recordCostEntry({ costEntries: this.costEntries }, input);
  }

  async recordTransaction(input: RecordTransactionDto): Promise<Transaction> {
    // occurredAt — ISO-строка в DTO (Swagger/zod v4 не представляют Date в
    // JSON Schema), домен ожидает Date — приведение на границе.
    return recordTransaction(
      { transactions: this.transactions },
      { ...input, occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined },
    );
  }

  async createInvoice(input: CreateInvoiceDto): Promise<Invoice> {
    return createInvoice({ invoices: this.invoices }, input);
  }

  async issueInvoice(companyId: string, invoiceId: string): Promise<Invoice> {
    return issueInvoice({ invoices: this.invoices }, { companyId, invoiceId });
  }

  async markInvoicePaid(companyId: string, invoiceId: string): Promise<Invoice> {
    return markInvoicePaid({ invoices: this.invoices }, { companyId, invoiceId });
  }

  async markInvoiceOverdue(companyId: string, invoiceId: string): Promise<Invoice> {
    return markInvoiceOverdue({ invoices: this.invoices }, { companyId, invoiceId });
  }

  async cancelInvoice(companyId: string, invoiceId: string): Promise<Invoice> {
    return cancelInvoice({ invoices: this.invoices }, { companyId, invoiceId });
  }
}
