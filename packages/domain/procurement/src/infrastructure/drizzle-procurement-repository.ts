import {
  materials,
  purchaseOrderItems,
  purchaseOrders,
  suppliers,
  type DbOrTx,
} from "@garmentos/db-schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Material } from "../domain/material";
import type { Supplier } from "../domain/supplier";
import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from "../domain/purchase-order";
import type {
  MaterialRepository,
  NewMaterialInput,
  NewPurchaseOrderInput,
  NewSupplierInput,
  PurchaseOrderRepository,
  SupplierRepository,
} from "../application/ports";

type MaterialRow = typeof materials.$inferSelect;
type SupplierRow = typeof suppliers.$inferSelect;
type PurchaseOrderRow = typeof purchaseOrders.$inferSelect;
type PurchaseOrderItemRow = typeof purchaseOrderItems.$inferSelect;

function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    type: row.type,
    unit: row.unit,
    reorderPoint: row.reorderPoint,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    type: row.type,
    status: row.status,
    inn: row.inn,
    contactInfo: row.contactInfo,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

function toPurchaseOrderItem(row: PurchaseOrderItemRow): PurchaseOrderItem {
  return {
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    materialId: row.materialId,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPurchaseOrder(row: PurchaseOrderRow, items: PurchaseOrderItemRow[]): PurchaseOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    supplierId: row.supplierId,
    status: row.status,
    orderedAt: row.orderedAt,
    expectedDate: row.expectedDate,
    currency: row.currency,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map(toPurchaseOrderItem),
  };
}

export class DrizzleMaterialRepository implements MaterialRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewMaterialInput): Promise<Material> {
    const [row] = await this.db.insert(materials).values(input).returning();
    if (!row) throw new Error("INSERT materials не вернул строку");
    return toMaterial(row);
  }

  async findById(companyId: string, id: string): Promise<Material | null> {
    const [row] = await this.db
      .select()
      .from(materials)
      .where(and(eq(materials.companyId, companyId), eq(materials.id, id)))
      .limit(1);
    return row ? toMaterial(row) : null;
  }

  async listByCompany(companyId: string): Promise<Material[]> {
    const rows = await this.db.select().from(materials).where(eq(materials.companyId, companyId));
    return rows.map(toMaterial);
  }
}

export class DrizzleSupplierRepository implements SupplierRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewSupplierInput): Promise<Supplier> {
    const [row] = await this.db.insert(suppliers).values(input).returning();
    if (!row) throw new Error("INSERT suppliers не вернул строку");
    return toSupplier(row);
  }

  async findById(companyId: string, id: string): Promise<Supplier | null> {
    const [row] = await this.db
      .select()
      .from(suppliers)
      .where(and(eq(suppliers.companyId, companyId), eq(suppliers.id, id)))
      .limit(1);
    return row ? toSupplier(row) : null;
  }

  async listByCompany(companyId: string): Promise<Supplier[]> {
    const rows = await this.db.select().from(suppliers).where(eq(suppliers.companyId, companyId));
    return rows.map(toSupplier);
  }
}

export class DrizzlePurchaseOrderRepository implements PurchaseOrderRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewPurchaseOrderInput): Promise<PurchaseOrder> {
    return this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(purchaseOrders)
        .values({
          companyId: input.companyId,
          supplierId: input.supplierId,
          status: input.status,
          orderedAt: input.orderedAt,
          expectedDate: input.expectedDate,
          currency: input.currency,
          createdBy: input.createdBy,
        })
        .returning();
      if (!orderRow) throw new Error("INSERT purchase_orders не вернул строку");

      const itemRows = await tx
        .insert(purchaseOrderItems)
        .values(
          input.items.map((item) => ({
            purchaseOrderId: orderRow.id,
            materialId: item.materialId,
            quantity: String(item.quantity),
            unitPrice: String(item.unitPrice),
          })),
        )
        .returning();

      return toPurchaseOrder(orderRow, itemRows);
    });
  }

  async findById(companyId: string, id: string): Promise<PurchaseOrder | null> {
    const [orderRow] = await this.db
      .select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.id, id)))
      .limit(1);
    if (!orderRow) return null;

    const itemRows = await this.db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, orderRow.id));

    return toPurchaseOrder(orderRow, itemRows);
  }

  async updateStatus(id: string, status: PurchaseOrderStatus): Promise<PurchaseOrder> {
    const [orderRow] = await this.db
      .update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    if (!orderRow) throw new Error(`UPDATE purchase_orders не нашёл строку id=${id}`);

    const itemRows = await this.db
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, orderRow.id));

    return toPurchaseOrder(orderRow, itemRows);
  }

  async listByCompany(companyId: string): Promise<PurchaseOrder[]> {
    const orderRows = await this.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.companyId, companyId))
      .orderBy(desc(purchaseOrders.createdAt));
    if (orderRows.length === 0) return [];

    const itemRows = await this.db
      .select()
      .from(purchaseOrderItems)
      .where(
        inArray(
          purchaseOrderItems.purchaseOrderId,
          orderRows.map((row) => row.id),
        ),
      );

    return orderRows.map((orderRow) =>
      toPurchaseOrder(
        orderRow,
        itemRows.filter((item) => item.purchaseOrderId === orderRow.id),
      ),
    );
  }
}
