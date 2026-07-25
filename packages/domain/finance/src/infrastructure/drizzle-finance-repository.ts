import { costEntries, transactions, invoices, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { CostEntry } from "../domain/cost-entry";
import type { Transaction } from "../domain/transaction";
import type { Invoice, InvoiceStatus } from "../domain/invoice";
import type {
  CostEntryRepository,
  InvoiceRepository,
  NewCostEntryInput,
  NewInvoiceInput,
  NewTransactionInput,
  TransactionRepository,
} from "../application/ports";

type CostEntryRow = typeof costEntries.$inferSelect;
type TransactionRow = typeof transactions.$inferSelect;
type InvoiceRow = typeof invoices.$inferSelect;

function toCostEntry(row: CostEntryRow): CostEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    productVariantId: row.productVariantId,
    productionOrderId: row.productionOrderId,
    materialCost: row.materialCost,
    manufacturingCost: row.manufacturingCost,
    logisticsCost: row.logisticsCost,
    overheadCost: row.overheadCost,
    calculatedAt: row.calculatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    companyId: row.companyId,
    type: row.type,
    amount: row.amount,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    companyId: row.companyId,
    orderId: row.orderId,
    purchaseOrderId: row.purchaseOrderId,
    productionOrderId: row.productionOrderId,
    status: row.status,
    amount: row.amount,
    dueDate: row.dueDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleCostEntryRepository implements CostEntryRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewCostEntryInput): Promise<CostEntry> {
    const [row] = await this.db
      .insert(costEntries)
      .values({
        companyId: input.companyId,
        productVariantId: input.productVariantId,
        productionOrderId: input.productionOrderId,
        materialCost: String(input.materialCost),
        manufacturingCost: String(input.manufacturingCost),
        logisticsCost: String(input.logisticsCost),
        overheadCost: String(input.overheadCost),
      })
      .returning();
    if (!row) throw new Error("INSERT cost_entries не вернул строку");
    return toCostEntry(row);
  }
}

export class DrizzleTransactionRepository implements TransactionRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewTransactionInput): Promise<Transaction> {
    const [row] = await this.db
      .insert(transactions)
      .values({
        companyId: input.companyId,
        type: input.type,
        amount: String(input.amount),
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        occurredAt: input.occurredAt,
      })
      .returning();
    if (!row) throw new Error("INSERT transactions не вернул строку");
    return toTransaction(row);
  }
}

export class DrizzleInvoiceRepository implements InvoiceRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewInvoiceInput): Promise<Invoice> {
    const [row] = await this.db
      .insert(invoices)
      .values({
        companyId: input.companyId,
        orderId: input.orderId,
        purchaseOrderId: input.purchaseOrderId,
        productionOrderId: input.productionOrderId,
        status: input.status,
        amount: String(input.amount),
        dueDate: input.dueDate,
      })
      .returning();
    if (!row) throw new Error("INSERT invoices не вернул строку");
    return toInvoice(row);
  }

  async findById(companyId: string, id: string): Promise<Invoice | null> {
    const [row] = await this.db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)))
      .limit(1);
    return row ? toInvoice(row) : null;
  }

  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const [row] = await this.db
      .update(invoices)
      .set({ status, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE invoices не нашёл строку id=${id}`);
    return toInvoice(row);
  }
}
