import { assertNonNegativeAmount, type Invoice } from "../domain/invoice";
import type { InvoiceRepository } from "./ports";

export interface CreateInvoiceInput {
  companyId: string;
  amount: number;
  orderId?: string;
  purchaseOrderId?: string;
  productionOrderId?: string;
  dueDate?: string;
}

export interface CreateInvoiceDeps {
  invoices: InvoiceRepository;
}

export async function createInvoice(deps: CreateInvoiceDeps, input: CreateInvoiceInput): Promise<Invoice> {
  assertNonNegativeAmount(input.amount);

  return deps.invoices.create({
    companyId: input.companyId,
    orderId: input.orderId ?? null,
    purchaseOrderId: input.purchaseOrderId ?? null,
    productionOrderId: input.productionOrderId ?? null,
    status: "draft",
    amount: input.amount,
    dueDate: input.dueDate ?? null,
  });
}
