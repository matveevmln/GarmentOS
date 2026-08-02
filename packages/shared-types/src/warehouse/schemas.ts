import { z } from "zod";

// Контракты модуля Warehouse & Inventory (docs/ARCHITECTURE.md, раздел 3;
// CLAUDE.md, глоссарий: stock/goodsReceipt/dispatch/shipment).

export const warehouseTypeSchema = z.enum(["own", "workshop", "marketplace_fbo", "consignment"]);

export const createWarehouseSchema = z.object({
  name: z.string().min(1, "Название склада не может быть пустым"),
  type: warehouseTypeSchema.optional(),
  country: z.string().optional(),
  workshopId: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
});
export type CreateWarehouseDto = z.infer<typeof createWarehouseSchema>;

export const warehouseResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  type: warehouseTypeSchema,
  country: z.string().nullable(),
  workshopId: z.string().uuid().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type WarehouseResponseDto = z.infer<typeof warehouseResponseSchema>;

export const stockItemResponseSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantityOnHand: z.string(),
  quantityReserved: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type StockItemResponseDto = z.infer<typeof stockItemResponseSchema>;

export const receiveStockSchema = z.object({
  warehouseId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type ReceiveStockDto = z.infer<typeof receiveStockSchema>;

export const dispatchStockSchema = receiveStockSchema;
export type DispatchStockDto = z.infer<typeof dispatchStockSchema>;

export const transferStockSchema = z.object({
  originWarehouseId: z.string().uuid(),
  destinationWarehouseId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  createdBy: z.string().uuid().optional(),
});
export type TransferStockDto = z.infer<typeof transferStockSchema>;

export const transferStockResponseSchema = z.object({
  origin: stockItemResponseSchema,
  destination: stockItemResponseSchema,
});
export type TransferStockResponseDto = z.infer<typeof transferStockResponseSchema>;

export const stockReservationSchema = z.object({
  warehouseId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
});
export type StockReservationDto = z.infer<typeof stockReservationSchema>;

export const shipmentStatusSchema = z.enum(["planned", "in_transit", "customs_clearance", "delivered", "cancelled"]);

export const shipmentItemDraftSchema = z.object({
  productVariantId: z.string().uuid(),
  quantity: z.number().positive(),
});

export const createShipmentSchema = z.object({
  originWarehouseId: z.string().uuid(),
  destinationWarehouseId: z.string().uuid(),
  carrierId: z.string().uuid().optional(),
  trackingNumber: z.string().optional(),
  items: z.array(shipmentItemDraftSchema).min(1, "Отгрузка должна содержать хотя бы одну позицию SKU"),
  createdBy: z.string().uuid().optional(),
});
export type CreateShipmentDto = z.infer<typeof createShipmentSchema>;

export const shipmentItemResponseSchema = z.object({
  id: z.string().uuid(),
  shipmentId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  quantity: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const shipmentResponseSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  originWarehouseId: z.string().uuid(),
  destinationWarehouseId: z.string().uuid(),
  carrierId: z.string().uuid().nullable(),
  status: shipmentStatusSchema,
  trackingNumber: z.string().nullable(),
  shippedAt: z.date().nullable(),
  deliveredAt: z.date().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(shipmentItemResponseSchema),
});
export type ShipmentResponseDto = z.infer<typeof shipmentResponseSchema>;

export const inventoryCountStatusSchema = z.enum(["in_progress", "completed", "cancelled"]);

export const createInventoryCountSchema = z.object({
  warehouseId: z.string().uuid(),
  performedBy: z.string().uuid().optional(),
});
export type CreateInventoryCountDto = z.infer<typeof createInventoryCountSchema>;

export const inventoryCountItemResponseSchema = z.object({
  id: z.string().uuid(),
  inventoryCountId: z.string().uuid(),
  productVariantId: z.string().uuid(),
  expectedQuantity: z.string(),
  actualQuantity: z.string(),
  discrepancy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const inventoryCountResponseSchema = z.object({
  id: z.string().uuid(),
  warehouseId: z.string().uuid(),
  status: inventoryCountStatusSchema,
  performedBy: z.string().uuid().nullable(),
  performedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  items: z.array(inventoryCountItemResponseSchema),
});
export type InventoryCountResponseDto = z.infer<typeof inventoryCountResponseSchema>;

export const recordInventoryCountItemSchema = z.object({
  productVariantId: z.string().uuid(),
  actualQuantity: z.number().min(0),
  createdBy: z.string().uuid().optional(),
});
export type RecordInventoryCountItemDto = z.infer<typeof recordInventoryCountItemSchema>;
