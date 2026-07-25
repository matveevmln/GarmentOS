import { assertPositiveAmount, type Transaction, type TransactionType } from "../domain/transaction";
import type { TransactionRepository } from "./ports";

export interface RecordTransactionInput {
  companyId: string;
  type: TransactionType;
  amount: number;
  referenceType?: string;
  referenceId?: string;
  occurredAt?: Date;
}

export interface RecordTransactionDeps {
  transactions: TransactionRepository;
}

export async function recordTransaction(deps: RecordTransactionDeps, input: RecordTransactionInput): Promise<Transaction> {
  assertPositiveAmount(input.amount);

  return deps.transactions.create({
    companyId: input.companyId,
    type: input.type,
    amount: input.amount,
    referenceType: input.referenceType ?? null,
    referenceId: input.referenceId ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  });
}
