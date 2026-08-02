import { z } from "zod";

// Контракты модуля Materials & Procurement (docs/ARCHITECTURE.md, раздел 3;
// CLAUDE.md, глоссарий: material/supplier/purchaseOrder — заказ материалов у
// поставщика, не путать с productionOrder — заказом пошива у workshop).

export const materialTypeSchema = z.enum(["fabric", "trim", "packaging", "accessory"]);
export const materialUnitSchema = z.enum(["m", "kg", "pcs"]);

// companyId — из аутентифицированного принципала (docs/AUTH_ARCHITECTURE.md, раздел 8).
export const createMaterialSchema = z.object({
  name: z.string().min(1, "Название материала не может быть пустым"),
  type: materialTypeSchema,
  unit: materialUnitSchema,
  reorderPoint: z.number().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateMaterialDto = z.infer<typeof createMaterialSchema>;

export const materialResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  type: materialTypeSchema,
  unit: materialUnitSchema,
  reorderPoint: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type MaterialResponseDto = z.infer<typeof materialResponseSchema>;

export const supplierTypeSchema = z.enum(["fabric", "trim", "packaging", "logistics"]);
export const partnerStatusSchema = z.enum(["draft", "active", "archived"]);

export const createSupplierSchema = z.object({
  name: z.string().min(1, "Название поставщика не может быть пустым"),
  type: supplierTypeSchema,
  status: partnerStatusSchema.optional(),
  inn: z.string().optional(),
  contactInfo: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>;

export const supplierResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  type: supplierTypeSchema,
  status: partnerStatusSchema,
  inn: z.string().nullable(),
  contactInfo: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});
export type SupplierResponseDto = z.infer<typeof supplierResponseSchema>;

export const purchaseOrderStatusSchema = z.enum(["draft", "sent", "partially_received", "received", "cancelled"]);

export const purchaseOrderItemDraftSchema = z.object({
  materialId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  items: z.array(purchaseOrderItemDraftSchema).min(1, "Закупка должна содержать хотя бы одну позицию материала"),
  orderedAt: z.string().optional(),
  expectedDate: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreatePurchaseOrderDto = z.infer<typeof createPurchaseOrderSchema>;

export const purchaseOrderItemResponseSchema = z.object({
  id: z.string().uuid(),
  purchaseOrderId: z.string().uuid(),
  materialId: z.string().uuid(),
  quantity: z.string(),
  unitPrice: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const purchaseOrderResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: purchaseOrderStatusSchema,
  orderedAt: z.string(),
  expectedDate: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(purchaseOrderItemResponseSchema),
});
export type PurchaseOrderResponseDto = z.infer<typeof purchaseOrderResponseSchema>;

// Приёмка закупки — материалы поступают на указанный склад (не угадывается,
// владелец проекта, 2026-08-02): каждая позиция закупки увеличивает остаток
// материала на этом складе на заказанное количество (MVP: приёмка только
// "всё и сразу", без частичных количеств по строкам).
export const receivePurchaseOrderSchema = z.object({
  warehouseId: z.string().uuid(),
});
export type ReceivePurchaseOrderDto = z.infer<typeof receivePurchaseOrderSchema>;

