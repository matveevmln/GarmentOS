import { z } from "zod";
import { productionOrderCostSnapshotSchema } from "../contract-manufacturing/schemas";
import { documentResponseSchema } from "../document/schemas";

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

// «Расчёт стоимости спецификации» (владелец проекта, 2026-08-03) — фактическая
// себестоимость (ткань/фурнитура/упаковка из BOM × последняя цена закупки +
// стоимость пошива и прочие расходы из карточки модели) и цена, которая
// попадёт в спецификацию (фактическая минус согласованное уменьшение).
// Обе цифры показываются пользователю всегда вместе, ни одна не скрывается.
export const specificationPricingRequestSchema = z.object({
  totalQuantity: z.number().int().positive(),
  deduction: z.number().min(0).optional(),
});
export type SpecificationPricingRequestDto = z.infer<typeof specificationPricingRequestSchema>;

export const specificationPricingResponseSchema = z.object({
  fabricCostPerUnit: z.number(),
  trimCostPerUnit: z.number(),
  packagingCostPerUnit: z.number(),
  sewingCostPerUnit: z.number(),
  otherCostPerUnit: z.number(),
  actualCostPerUnit: z.number(),
  deductionPerUnit: z.number(),
  specificationPricePerUnit: z.number(),
  // Материалы BOM без единой закупки в истории — цену для них взять неоткуда
  // (не подставляется 0 молча, чтобы не занизить фактическую себестоимость).
  materialsWithoutPriceHistory: z.array(z.string()),
});
export type SpecificationPricingResponseDto = z.infer<typeof specificationPricingResponseSchema>;

export const attentionResponseSchema = z.object({
  overdueProductionOrders: z.array(overdueProductionOrderSchema),
  overduePurchaseOrders: z.array(overduePurchaseOrderSchema),
  lowStockMaterials: z.array(lowStockMaterialSchema),
  overdueInvoices: z.array(overdueInvoiceSchema),
});
export type AttentionResponseDto = z.infer<typeof attentionResponseSchema>;

// «Паспорт партии» (владелец проекта, 2026-08-03) — центральная карточка
// производственного заказа: композиция данных из Contract Manufacturing +
// Catalog + Document Engine + Finance в одном ответе (Reporting/BI, тот же
// принцип, что и attentionResponseSchema выше — читает поперёк модулей).
// Сознательно НЕ включает разделы «Материалы»/«ОТК»/«Логистика» из макета —
// их не с чем агрегировать, пока не утверждены соответствующие разделы
// docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md (16/4/22); фронтенд
// показывает честные пустые состояния вместо выдуманных полей.
export const batchPassportVariantSchema = z.object({
  productVariantId: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  quantity: z.string(),
});
export type BatchPassportVariantDto = z.infer<typeof batchPassportVariantSchema>;

export const batchPassportInvoiceSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  amount: z.number(),
  dueDate: z.string().nullable(),
});
export type BatchPassportInvoiceDto = z.infer<typeof batchPassportInvoiceSchema>;

export const batchPassportTimelineEventSchema = z.object({
  label: z.string(),
  occurredAt: z.date(),
});
export type BatchPassportTimelineEventDto = z.infer<typeof batchPassportTimelineEventSchema>;

export const batchPassportResponseSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
  plannedQuantity: z.string(),
  agreedUnitPrice: z.string(),
  dueDate: z.string().nullable(),
  // null — срок не просрочен либо не задан.
  daysOverdue: z.number().int().nullable(),
  createdAt: z.date(),
  product: z.object({ id: z.string().uuid(), name: z.string() }),
  workshop: z.object({
    id: z.string().uuid(),
    name: z.string(),
    contractNumber: z.string().nullable(),
    contractDate: z.string().nullable(),
    hasTelegramChat: z.boolean(),
  }),
  // Snapshot партии (docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, §26) —
  // null у заказов, подтверждённых до появления этого механизма.
  costSnapshot: productionOrderCostSnapshotSchema.nullable(),
  variants: z.array(batchPassportVariantSchema),
  documents: z.array(documentResponseSchema),
  invoices: z.array(batchPassportInvoiceSchema),
  timeline: z.array(batchPassportTimelineEventSchema),
});
export type BatchPassportResponseDto = z.infer<typeof batchPassportResponseSchema>;
