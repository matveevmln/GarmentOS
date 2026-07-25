import { z } from "zod";

// Контракты модуля Sales & Orders (docs/ARCHITECTURE.md, раздел 3).

export const salesChannelTypeSchema = z.enum(["marketplace", "wholesale", "retail", "own_website"]);

export const createSalesChannelSchema = z.object({
  companyId: z.string().uuid(),
  type: salesChannelTypeSchema,
  name: z.string().min(1, "Название канала продаж не может быть пустым"),
});
export type CreateSalesChannelDto = z.infer<typeof createSalesChannelSchema>;

export const salesChannelResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  type: salesChannelTypeSchema,
  name: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SalesChannelResponseDto = z.infer<typeof salesChannelResponseSchema>;

export const orderStatusSchema = z.enum(["new", "confirmed", "shipped", "delivered", "cancelled", "returned"]);

export const orderItemDraftSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
});

export const createOrderSchema = z.object({
  companyId: z.string().uuid(),
  salesChannelId: z.string().uuid(),
  items: z.array(orderItemDraftSchema).min(1, "Заказ должен содержать хотя бы одну позицию"),
  externalOrderId: z.string().optional(),
  orderedAt: z.coerce.date().optional(),
});
export type CreateOrderDto = z.infer<typeof createOrderSchema>;

export const orderItemResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.string(),
  unitPrice: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  salesChannelId: z.string().uuid(),
  externalOrderId: z.string().nullable(),
  status: orderStatusSchema,
  totalAmount: z.string(),
  orderedAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(orderItemResponseSchema),
});
export type OrderResponseDto = z.infer<typeof orderResponseSchema>;

export const transitionOrderStatusSchema = z.object({
  companyId: z.string().uuid(),
});
export type TransitionOrderStatusDto = z.infer<typeof transitionOrderStatusSchema>;
