import { DomainError } from "../domain/errors";
import { assertValidTransition, type Invoice, type InvoiceStatus } from "../domain/invoice";
import type { InvoiceRepository } from "./ports";

export interface TransitionInvoiceStatusInput {
  companyId: string;
  invoiceId: string;
}

export interface TransitionInvoiceStatusDeps {
  invoices: InvoiceRepository;
}

async function transition(
  deps: TransitionInvoiceStatusDeps,
  input: TransitionInvoiceStatusInput,
  to: InvoiceStatus,
): Promise<Invoice> {
  const invoice = await deps.invoices.findById(input.companyId, input.invoiceId);
  if (!invoice) {
    throw new DomainError(`Счёт ${input.invoiceId} не найден в этой компании`, "INVOICE_NOT_FOUND");
  }
  assertValidTransition(invoice.status, to);

  return deps.invoices.updateStatus(invoice.id, to);
}

export const issueInvoice = (deps: TransitionInvoiceStatusDeps, input: TransitionInvoiceStatusInput) =>
  transition(deps, input, "issued");

export const markInvoicePaid = (deps: TransitionInvoiceStatusDeps, input: TransitionInvoiceStatusInput) =>
  transition(deps, input, "paid");

export const markInvoiceOverdue = (deps: TransitionInvoiceStatusDeps, input: TransitionInvoiceStatusInput) =>
  transition(deps, input, "overdue");

export const cancelInvoice = (deps: TransitionInvoiceStatusDeps, input: TransitionInvoiceStatusInput) =>
  transition(deps, input, "cancelled");
