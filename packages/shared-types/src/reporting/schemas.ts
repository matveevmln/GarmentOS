import { z } from "zod";

// Контракт модуля Reporting/BI (docs/ARCHITECTURE.md, раздел про Reporting/BI —
// «агрегированная аналитика, только чтение из других модулей»). Первый
// экран этого модуля — «Внимание сегодня» (docs/PRINCIPLES.md, принцип 23:
// сценарий пользователя, а не схема данных, — владелец бренда открывает
// систему утром и должен сразу увидеть, что требует действия, без обхода
// разделов «Закупки»/«Заказы пошива»/«Материалы»/«Финансы» по отдельности).

export const overdueProductionOrderSchema = z.object({
  id: z.string().uuid(),
  productName: z.string(),
  workshopName: z.string(),
  status: z.string(),
  dueDate: z.string(),
  daysOverdue: z.number().int(),
});
export type OverdueProductionOrderDto = z.infer<typeof overdueProductionOrderSchema>;

export const overduePurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  supplierName: z.string(),
  status: z.string(),
  expectedDate: z.string(),
  daysOverdue: z.number().int(),
});
export type OverduePurchaseOrderDto = z.infer<typeof overduePurchaseOrderSchema>;

export const lowStockMaterialSchema = z.object({
  materialId: z.string().uuid(),
  materialName: z.string(),
  unit: z.string(),
  quantityOnHand: z.number(),
  reorderPoint: z.number(),
});
export type LowStockMaterialDto = z.infer<typeof lowStockMaterialSchema>;

export const overdueInvoiceSchema = z.object({
  id: z.string().uuid(),
  amount: z.number(),
  dueDate: z.string().nullable(),
  referenceLabel: z.string(),
  daysOverdue: z.number().int().nullable(),
});
export type OverdueInvoiceDto = z.infer<typeof overdueInvoiceSchema>;

export const attentionResponseSchema = z.object({
  overdueProductionOrders: z.array(overdueProductionOrderSchema),
  overduePurchaseOrders: z.array(overduePurchaseOrderSchema),
  lowStockMaterials: z.array(lowStockMaterialSchema),
  overdueInvoices: z.array(overdueInvoiceSchema),
});
export type AttentionResponseDto = z.infer<typeof attentionResponseSchema>;
