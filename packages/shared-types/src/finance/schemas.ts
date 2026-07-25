import { z } from "zod";

// Контракты модуля Finance (docs/ARCHITECTURE.md, раздел 3).

export const recordCostEntrySchema = z.object({
  companyId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  productionOrderId: z.string().uuid().optional(),
  materialCost: z.number().min(0),
  manufacturingCost: z.number().min(0),
  logisticsCost: z.number().min(0).optional(),
  overheadCost: z.number().min(0).optional(),
});
export type RecordCostEntryDto = z.infer<typeof recordCostEntrySchema>;

export const costEntryResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  productionOrderId: z.string().uuid().nullable(),
  materialCost: z.string(),
  manufacturingCost: z.string(),
  logisticsCost: z.string(),
  overheadCost: z.string(),
  calculatedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type CostEntryResponseDto = z.infer<typeof costEntryResponseSchema>;

export const transactionTypeSchema = z.enum(["income", "expense"]);

export const recordTransactionSchema = z.object({
  companyId: z.string().uuid(),
  type: transactionTypeSchema,
  amount: z.number().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  // ISO-строка, не z.date() (см. sales/schemas.ts — Swagger/zod v4 ограничение).
  occurredAt: z.iso.datetime().optional(),
});
export type RecordTransactionDto = z.infer<typeof recordTransactionSchema>;

export const transactionResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  type: transactionTypeSchema,
  amount: z.string(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
  occurredAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TransactionResponseDto = z.infer<typeof transactionResponseSchema>;

export const invoiceStatusSchema = z.enum(["draft", "issued", "paid", "overdue", "cancelled"]);

export const createInvoiceSchema = z.object({
  companyId: z.string().uuid(),
  amount: z.number().min(0),
  orderId: z.string().uuid().optional(),
  purchaseOrderId: z.string().uuid().optional(),
  productionOrderId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});
export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const invoiceResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  orderId: z.string().uuid().nullable(),
  purchaseOrderId: z.string().uuid().nullable(),
  productionOrderId: z.string().uuid().nullable(),
  status: invoiceStatusSchema,
  amount: z.string(),
  dueDate: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type InvoiceResponseDto = z.infer<typeof invoiceResponseSchema>;

export const transitionInvoiceStatusSchema = z.object({
  companyId: z.string().uuid(),
});
export type TransitionInvoiceStatusDto = z.infer<typeof transitionInvoiceStatusSchema>;
