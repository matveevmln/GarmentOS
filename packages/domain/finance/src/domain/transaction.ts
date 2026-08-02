import { DomainError } from "./errors";

export type TransactionType = "income" | "expense";

// Движение денег — приход/расход (docs/DATABASE_SCHEMA.md, раздел 14).
export interface Transaction {
  id: string;
  companyId: string;
  type: TransactionType;
  amount: string;
  referenceType: string | null;
  referenceId: string | null;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export function assertPositiveAmount(amount: number): void {
  if (amount <= 0) {
    throw new DomainError(`Сумма движения должна быть положительной (получено ${amount})`, "TRANSACTION_AMOUNT_INVALID");
  }
}
