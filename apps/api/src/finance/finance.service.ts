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
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { COST_ENTRY_REPOSITORY, INVOICE_REPOSITORY, TRANSACTION_REPOSITORY } from "./finance.tokens";

// Тонкий presentation-адаптер поверх packages/domain/finance
// (docs/ARCHITECTURE.md, раздел 2) — репозитории внедряются через DI по
// токенам доменных портов, тот же паттерн, что и в остальных модулях.
//
// Аудит (Итерация 6): "финансовые проводки" — явно названный в
// docs/ARCHITECTURE.md, раздел 7 пример критичной операции. Проводка
// (transaction) — создание, before всегда null; переходы статуса счёта —
// с реальным before/after статусом.
@Injectable()
export class FinanceService {
  constructor(
    @Inject(COST_ENTRY_REPOSITORY) private readonly costEntries: CostEntryRepository,
    @Inject(TRANSACTION_REPOSITORY) private readonly transactions: TransactionRepository,
    @Inject(INVOICE_REPOSITORY) private readonly invoices: InvoiceRepository,
    private readonly auditService: AuditService,
  ) {}

  async recordCostEntry(companyId: string, input: RecordCostEntryDto): Promise<CostEntry> {
    return recordCostEntry({ costEntries: this.costEntries }, { ...input, companyId });
  }

  async recordTransaction(currentUser: AuthenticatedRequestUser, input: RecordTransactionDto): Promise<Transaction> {
    // occurredAt — ISO-строка в DTO (Swagger/zod v4 не представляют Date в
    // JSON Schema), домен ожидает Date — приведение на границе.
    const transaction = await recordTransaction(
      { transactions: this.transactions },
      { ...input, companyId: currentUser.companyId, occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "transaction",
      entityId: transaction.id,
      action: "finance.record_transaction",
      afterJson: { type: transaction.type, amount: transaction.amount },
    });
    return transaction;
  }

  async createInvoice(companyId: string, input: CreateInvoiceDto): Promise<Invoice> {
    return createInvoice({ invoices: this.invoices }, { ...input, companyId });
  }

  async issueInvoice(currentUser: AuthenticatedRequestUser, invoiceId: string): Promise<Invoice> {
    return this.transitionInvoice(currentUser, invoiceId, "finance.invoice_issue", (companyId) =>
      issueInvoice({ invoices: this.invoices }, { companyId, invoiceId }),
    );
  }

  async markInvoicePaid(currentUser: AuthenticatedRequestUser, invoiceId: string): Promise<Invoice> {
    return this.transitionInvoice(currentUser, invoiceId, "finance.invoice_pay", (companyId) =>
      markInvoicePaid({ invoices: this.invoices }, { companyId, invoiceId }),
    );
  }

  async markInvoiceOverdue(currentUser: AuthenticatedRequestUser, invoiceId: string): Promise<Invoice> {
    return this.transitionInvoice(currentUser, invoiceId, "finance.invoice_overdue", (companyId) =>
      markInvoiceOverdue({ invoices: this.invoices }, { companyId, invoiceId }),
    );
  }

  async cancelInvoice(currentUser: AuthenticatedRequestUser, invoiceId: string): Promise<Invoice> {
    return this.transitionInvoice(currentUser, invoiceId, "finance.invoice_cancel", (companyId) =>
      cancelInvoice({ invoices: this.invoices }, { companyId, invoiceId }),
    );
  }

  private async transitionInvoice(
    currentUser: AuthenticatedRequestUser,
    invoiceId: string,
    action: string,
    run: (companyId: string) => Promise<Invoice>,
  ): Promise<Invoice> {
    const before = await this.invoices.findById(currentUser.companyId, invoiceId);
    const invoice = await run(currentUser.companyId);
    await this.auditService.recordForUser(currentUser, {
      entityType: "invoice",
      entityId: invoice.id,
      action,
      beforeJson: before ? { status: before.status } : null,
      afterJson: { status: invoice.status },
    });
    return invoice;
  }
}
