import { Inject, Injectable } from "@nestjs/common";
import {
  invoices,
  materials,
  materialStockItems,
  orders,
  products,
  productionOrders,
  purchaseOrders,
  suppliers,
  warehouses,
  workshops,
  type Database,
} from "@garmentos/db-schema";
import type {
  AttentionResponseDto,
  LowStockMaterialDto,
  OverdueInvoiceDto,
  OverduePurchaseOrderDto,
  OverdueProductionOrderDto,
} from "@garmentos/shared-types";
import { and, eq, lt, notInArray, sql } from "drizzle-orm";
import { DATABASE_CONNECTION } from "../database/database.module";

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

// Reporting/BI (docs/ARCHITECTURE.md: «агрегированная аналитика, только
// чтение из других модулей») — первый экран «Внимание сегодня»
// (docs/PRINCIPLES.md, принцип 23): владелец бренда открывает систему утром
// и должен увидеть, что требует действия сегодня, не заходя по очереди в
// Закупки/Заказы пошива/Материалы/Финансы. Этот модуль сознательно читает
// таблицы напрямую (а не через сервисы других модулей) — тот же принцип, что
// уже описан для Reporting/BI: агрегация поверх нескольких модулей — не
// доменная операция одного модуля, поэтому не обязана идти через его порт.
@Injectable()
export class AttentionService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: Database) {}

  async getAttention(companyId: string): Promise<AttentionResponseDto> {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const [overdueProductionOrders, overduePurchaseOrders, lowStockMaterials, overdueInvoices] = await Promise.all([
      this.findOverdueProductionOrders(companyId, today, todayIso),
      this.findOverduePurchaseOrders(companyId, today, todayIso),
      this.findLowStockMaterials(companyId),
      this.findOverdueInvoices(companyId, today, todayIso),
    ]);

    return { overdueProductionOrders, overduePurchaseOrders, lowStockMaterials, overdueInvoices };
  }

  private async findOverdueProductionOrders(
    companyId: string,
    today: Date,
    todayIso: string,
  ): Promise<OverdueProductionOrderDto[]> {
    const rows = await this.db
      .select({
        id: productionOrders.id,
        status: productionOrders.status,
        dueDate: productionOrders.dueDate,
        productName: products.name,
        workshopName: workshops.name,
      })
      .from(productionOrders)
      .innerJoin(products, eq(products.id, productionOrders.productId))
      .innerJoin(workshops, eq(workshops.id, productionOrders.workshopId))
      .where(
        and(
          eq(productionOrders.companyId, companyId),
          notInArray(productionOrders.status, ["received", "cancelled"]),
          lt(productionOrders.dueDate, todayIso),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      productName: row.productName,
      workshopName: row.workshopName,
      status: row.status,
      dueDate: row.dueDate ?? todayIso,
      daysOverdue: daysBetween(new Date(row.dueDate ?? todayIso), today),
    }));
  }

  private async findOverduePurchaseOrders(
    companyId: string,
    today: Date,
    todayIso: string,
  ): Promise<OverduePurchaseOrderDto[]> {
    const rows = await this.db
      .select({
        id: purchaseOrders.id,
        status: purchaseOrders.status,
        expectedDate: purchaseOrders.expectedDate,
        supplierName: suppliers.name,
      })
      .from(purchaseOrders)
      .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .where(
        and(
          eq(purchaseOrders.companyId, companyId),
          notInArray(purchaseOrders.status, ["received", "cancelled"]),
          lt(purchaseOrders.expectedDate, todayIso),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      supplierName: row.supplierName,
      status: row.status,
      expectedDate: row.expectedDate ?? todayIso,
      daysOverdue: daysBetween(new Date(row.expectedDate ?? todayIso), today),
    }));
  }

  // Остаток материала — сумма по всем складам компании (материалы не
  // привязаны к одному складу так же жёстко, как готовые SKU) сравнивается с
  // точкой перезаказа модели (materials.reorderPoint, docs/DATABASE_SCHEMA.md
  // раздел 6) — только для материалов, где точка вообще задана.
  private async findLowStockMaterials(companyId: string): Promise<LowStockMaterialDto[]> {
    const rows = await this.db
      .select({
        materialId: materials.id,
        materialName: materials.name,
        unit: materials.unit,
        reorderPoint: materials.reorderPoint,
        quantityOnHand: sql<string>`coalesce(sum(${materialStockItems.quantityOnHand}), 0)`,
      })
      .from(materials)
      .innerJoin(warehouses, eq(warehouses.companyId, materials.companyId))
      .leftJoin(
        materialStockItems,
        and(eq(materialStockItems.materialId, materials.id), eq(materialStockItems.warehouseId, warehouses.id)),
      )
      .where(and(eq(materials.companyId, companyId), sql`${materials.reorderPoint} is not null`))
      .groupBy(materials.id, materials.name, materials.unit, materials.reorderPoint);

    return rows
      .map((row) => ({
        materialId: row.materialId,
        materialName: row.materialName,
        unit: row.unit,
        quantityOnHand: Number(row.quantityOnHand),
        reorderPoint: Number(row.reorderPoint),
      }))
      .filter((row) => row.quantityOnHand < row.reorderPoint);
  }

  private async findOverdueInvoices(companyId: string, today: Date, todayIso: string): Promise<OverdueInvoiceDto[]> {
    const rows = await this.db
      .select({
        id: invoices.id,
        amount: invoices.amount,
        status: invoices.status,
        dueDate: invoices.dueDate,
        productName: products.name,
        supplierName: suppliers.name,
        externalOrderId: orders.externalOrderId,
      })
      .from(invoices)
      .leftJoin(productionOrders, eq(productionOrders.id, invoices.productionOrderId))
      .leftJoin(products, eq(products.id, productionOrders.productId))
      .leftJoin(purchaseOrders, eq(purchaseOrders.id, invoices.purchaseOrderId))
      .leftJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .where(
        and(
          eq(invoices.companyId, companyId),
          sql`(${invoices.status} = 'overdue' or (${invoices.status} = 'issued' and ${invoices.dueDate} < ${todayIso}))`,
        ),
      );

    return rows.map((row) => {
      const referenceLabel = row.productName
        ? `Заказ пошива «${row.productName}»`
        : row.supplierName
          ? `Закупка у «${row.supplierName}»`
          : row.externalOrderId
            ? `Заказ продажи ${row.externalOrderId}`
            : "Счёт без привязки";
      return {
        id: row.id,
        amount: Number(row.amount),
        dueDate: row.dueDate,
        referenceLabel,
        daysOverdue: row.dueDate ? daysBetween(new Date(row.dueDate), today) : null,
      };
    });
  }
}
