import { z } from "zod";

const quantityRow = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().int().min(0).max(999999999),
});
export const correctReceiptSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
  expectedVariants: z.array(quantityRow).min(1),
  variants: z.array(quantityRow).min(1),
});
export type CorrectReceiptDto = z.infer<typeof correctReceiptSchema>;

const amount = z
  .number()
  .positive()
  .max(999999999999.99)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.001,
    "Укажите сумму с точностью до копеек",
  );
export const recordBatchPaymentSchema = z.object({
  requestId: z.string().uuid(),
  direction: z.enum(["payment", "refund"]),
  currency: z.literal("RUB"),
  amount,
  note: z.string().trim().max(1000).default(""),
});
export type RecordBatchPaymentDto = z.infer<typeof recordBatchPaymentSchema>;
export const reverseBatchPaymentSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});
export type ReverseBatchPaymentDto = z.infer<typeof reverseBatchPaymentSchema>;
export interface BatchSettlementDto {
  currency: "RUB";
  agreedAmount: number;
  netPaid: number;
  outstanding: number | null;
  overpaid: number | null;
  unclassifiedTransactions: number;
  canWrite: boolean;
  payments: Array<{
    id: string;
    direction: "payment" | "refund";
    amount: number;
    note: string;
    reversalOfId: string | null;
    reversed: boolean;
    createdAt: string;
  }>;
}
export interface ReceiptCorrectionAvailabilityDto {
  allowed: boolean;
  reason: string | null;
}
