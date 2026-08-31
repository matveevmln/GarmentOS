import { warehouses, stockItems, stockMovements, materialStockItems, materialStockMovements, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { Warehouse } from "../domain/warehouse";
import type { StockItem } from "../domain/stock";
import type { MaterialStockItem } from "../domain/material-stock";
import type {
  MaterialStockMovementMeta,
  MaterialStockRepository,
  NewWarehouseInput,
  StockMovementMeta,
  StockRepository,
  WarehouseRepository,
} from "../application/ports";

type WarehouseRow = typeof warehouses.$inferSelect;
type StockItemRow = typeof stockItems.$inferSelect;
type MaterialStockItemRow = typeof materialStockItems.$inferSelect;

function toMaterialStockItem(row: MaterialStockItemRow): MaterialStockItem {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    materialId: row.materialId,
    quantityOnHand: row.quantityOnHand,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toWarehouse(row: WarehouseRow): Warehouse {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    type: row.type,
    country: row.country,
    workshopId: row.workshopId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toStockItem(row: StockItemRow): StockItem {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    productVariantId: row.productVariantId,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleWarehouseRepository implements WarehouseRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewWarehouseInput): Promise<Warehouse> {
    const [row] = await this.db.insert(warehouses).values(input).returning();
    if (!row) throw new Error("INSERT warehouses не вернул строку");
    return toWarehouse(row);
  }

  async findById(companyId: string, id: string): Promise<Warehouse | null> {
    const [row] = await this.db
      .select()
      .from(warehouses)
      .where(and(eq(warehouses.companyId, companyId), eq(warehouses.id, id)))
      .limit(1);
    return row ? toWarehouse(row) : null;
  }

  async listByCompany(companyId: string): Promise<Warehouse[]> {
    const rows = await this.db.select().from(warehouses).where(eq(warehouses.companyId, companyId));
    return rows.map(toWarehouse);
  }
}

export class DrizzleStockRepository implements StockRepository {
  constructor(private readonly db: DbOrTx) {}

  async findStockItem(warehouseId: string, productVariantId: string): Promise<StockItem | null> {
    const [row] = await this.db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouseId), eq(stockItems.productVariantId, productVariantId)))
      .limit(1);
    return row ? toStockItem(row) : null;
  }

  async receive(warehouseId: string, productVariantId: string, quantity: number, meta: StockMovementMeta): Promise<StockItem> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.warehouseId, warehouseId), eq(stockItems.productVariantId, productVariantId)))
        .limit(1);

      const stockItemRow = existing
        ? (
            await tx
              .update(stockItems)
              .set({ quantityOnHand: String(Number(existing.quantityOnHand) + quantity), updatedAt: new Date() })
              .where(eq(stockItems.id, existing.id))
              .returning()
          )[0]
        : (
            await tx
              .insert(stockItems)
              .values({ warehouseId, productVariantId, quantityOnHand: String(quantity), quantityReserved: "0" })
              .returning()
          )[0];
      if (!stockItemRow) throw new Error("receive: не удалось создать/обновить stock_items");

      await tx.insert(stockMovements).values({
        stockItemId: stockItemRow.id,
        type: "receipt",
        quantity: String(quantity),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      return toStockItem(stockItemRow);
    });
  }

  async dispatch(warehouseId: string, productVariantId: string, quantity: number, meta: StockMovementMeta): Promise<StockItem> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.warehouseId, warehouseId), eq(stockItems.productVariantId, productVariantId)))
        .limit(1);
      if (!existing) throw new Error(`dispatch: stock_items не найден (warehouse=${warehouseId}, variant=${productVariantId})`);

      const [stockItemRow] = await tx
        .update(stockItems)
        .set({ quantityOnHand: String(Number(existing.quantityOnHand) - quantity), updatedAt: new Date() })
        .where(eq(stockItems.id, existing.id))
        .returning();
      if (!stockItemRow) throw new Error("dispatch: UPDATE stock_items не вернул строку");

      await tx.insert(stockMovements).values({
        stockItemId: stockItemRow.id,
        type: "dispatch",
        quantity: String(quantity),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      return toStockItem(stockItemRow);
    });
  }

  async transfer(
    originWarehouseId: string,
    destinationWarehouseId: string,
    productVariantId: string,
    quantity: number,
    meta: StockMovementMeta,
  ): Promise<{ origin: StockItem; destination: StockItem }> {
    return this.db.transaction(async (tx) => {
      const [originExisting] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.warehouseId, originWarehouseId), eq(stockItems.productVariantId, productVariantId)))
        .limit(1);
      if (!originExisting) {
        throw new Error(`transfer: stock_items не найден на складе-источнике ${originWarehouseId}`);
      }

      const [originRow] = await tx
        .update(stockItems)
        .set({ quantityOnHand: String(Number(originExisting.quantityOnHand) - quantity), updatedAt: new Date() })
        .where(eq(stockItems.id, originExisting.id))
        .returning();
      if (!originRow) throw new Error("transfer: UPDATE origin stock_items не вернул строку");

      await tx.insert(stockMovements).values({
        stockItemId: originRow.id,
        type: "transfer",
        quantity: String(quantity),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      const [destinationExisting] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.warehouseId, destinationWarehouseId), eq(stockItems.productVariantId, productVariantId)))
        .limit(1);

      const destinationRow = destinationExisting
        ? (
            await tx
              .update(stockItems)
              .set({
                quantityOnHand: String(Number(destinationExisting.quantityOnHand) + quantity),
                updatedAt: new Date(),
              })
              .where(eq(stockItems.id, destinationExisting.id))
              .returning()
          )[0]
        : (
            await tx
              .insert(stockItems)
              .values({
                warehouseId: destinationWarehouseId,
                productVariantId,
                quantityOnHand: String(quantity),
                quantityReserved: "0",
              })
              .returning()
          )[0];
      if (!destinationRow) throw new Error("transfer: не удалось создать/обновить stock_items назначения");

      await tx.insert(stockMovements).values({
        stockItemId: destinationRow.id,
        type: "transfer",
        quantity: String(quantity),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      return { origin: toStockItem(originRow), destination: toStockItem(destinationRow) };
    });
  }

  async reserve(warehouseId: string, productVariantId: string, quantity: number): Promise<StockItem> {
    const [existing] = await this.db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouseId), eq(stockItems.productVariantId, productVariantId)))
      .limit(1);
    if (!existing) throw new Error(`reserve: stock_items не найден (warehouse=${warehouseId}, variant=${productVariantId})`);

    const [row] = await this.db
      .update(stockItems)
      .set({ quantityReserved: String(Number(existing.quantityReserved) + quantity), updatedAt: new Date() })
      .where(eq(stockItems.id, existing.id))
      .returning();
    if (!row) throw new Error("reserve: UPDATE stock_items не вернул строку");
    return toStockItem(row);
  }

  async release(warehouseId: string, productVariantId: string, quantity: number): Promise<StockItem> {
    const [existing] = await this.db
      .select()
      .from(stockItems)
      .where(and(eq(stockItems.warehouseId, warehouseId), eq(stockItems.productVariantId, productVariantId)))
      .limit(1);
    if (!existing) throw new Error(`release: stock_items не найден (warehouse=${warehouseId}, variant=${productVariantId})`);

    const [row] = await this.db
      .update(stockItems)
      .set({ quantityReserved: String(Number(existing.quantityReserved) - quantity), updatedAt: new Date() })
      .where(eq(stockItems.id, existing.id))
      .returning();
    if (!row) throw new Error("release: UPDATE stock_items не вернул строку");
    return toStockItem(row);
  }

  async adjust(
    warehouseId: string,
    productVariantId: string,
    actualQuantity: number,
    createdBy: string | null,
  ): Promise<{ stockItem: StockItem; discrepancy: number }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(stockItems)
        .where(and(eq(stockItems.warehouseId, warehouseId), eq(stockItems.productVariantId, productVariantId)))
        .limit(1);

      const previousOnHand = existing ? Number(existing.quantityOnHand) : 0;
      const discrepancy = actualQuantity - previousOnHand;

      const stockItemRow = existing
        ? (
            await tx
              .update(stockItems)
              .set({ quantityOnHand: String(actualQuantity), updatedAt: new Date() })
              .where(eq(stockItems.id, existing.id))
              .returning()
          )[0]
        : (
            await tx
              .insert(stockItems)
              .values({ warehouseId, productVariantId, quantityOnHand: String(actualQuantity), quantityReserved: "0" })
              .returning()
          )[0];
      if (!stockItemRow) throw new Error("adjust: не удалось создать/обновить stock_items");

      if (discrepancy !== 0) {
        await tx.insert(stockMovements).values({
          stockItemId: stockItemRow.id,
          type: "adjustment",
          quantity: String(discrepancy),
          referenceType: "inventory_count",
          referenceId: null,
          createdBy,
        });
      }

      return { stockItem: toStockItem(stockItemRow), discrepancy };
    });
  }
}

export class DrizzleMaterialStockRepository implements MaterialStockRepository {
  constructor(private readonly db: DbOrTx) {}

  async findMaterialStockItem(warehouseId: string, materialId: string): Promise<MaterialStockItem | null> {
    const [row] = await this.db
      .select()
      .from(materialStockItems)
      .where(and(eq(materialStockItems.warehouseId, warehouseId), eq(materialStockItems.materialId, materialId)))
      .limit(1);
    return row ? toMaterialStockItem(row) : null;
  }

  async receive(warehouseId: string, materialId: string, quantity: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(materialStockItems)
        .where(and(eq(materialStockItems.warehouseId, warehouseId), eq(materialStockItems.materialId, materialId)))
        .limit(1);

      const row = existing
        ? (
            await tx
              .update(materialStockItems)
              .set({ quantityOnHand: String(Number(existing.quantityOnHand) + quantity), updatedAt: new Date() })
              .where(eq(materialStockItems.id, existing.id))
              .returning()
          )[0]
        : (
            await tx
              .insert(materialStockItems)
              .values({ warehouseId, materialId, quantityOnHand: String(quantity) })
              .returning()
          )[0];
      if (!row) throw new Error("receive: не удалось создать/обновить material_stock_items");

      await tx.insert(materialStockMovements).values({
        materialStockItemId: row.id,
        type: "receipt",
        quantity: String(quantity),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      return toMaterialStockItem(row);
    });
  }

  async consume(warehouseId: string, materialId: string, quantity: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(materialStockItems)
        .where(and(eq(materialStockItems.warehouseId, warehouseId), eq(materialStockItems.materialId, materialId)))
        .limit(1);
      // Строки остатка может не быть вовсе — например, материал реально
      // израсходован в крое, но приход по нему ещё не оприходован. Раньше
      // это была ошибка; с 2026-08-30 факт производства не блокируется
      // состоянием учёта, поэтому строка заводится с нуля и уходит в минус.
      const target = existing
        ? existing
        : (
            await tx
              .insert(materialStockItems)
              .values({ warehouseId, materialId, quantityOnHand: "0" })
              .returning()
          )[0];
      if (!target) throw new Error("consume: не удалось создать material_stock_items");

      const [row] = await tx
        .update(materialStockItems)
        .set({ quantityOnHand: String(Number(target.quantityOnHand) - quantity), updatedAt: new Date() })
        .where(eq(materialStockItems.id, target.id))
        .returning();
      if (!row) throw new Error("consume: UPDATE material_stock_items не вернул строку");

      await tx.insert(materialStockMovements).values({
        materialStockItemId: row.id,
        type: "consumption",
        quantity: String(quantity),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      return toMaterialStockItem(row);
    });
  }

  // Корректировка остатка на разницу (владелец проекта, 2026-08-30 —
  // «нельзя молча переписывать историю»). Прошлое движение не изменяется и не
  // удаляется: исправление факта кроя добавляет отдельную строку типа
  // adjustment на дельту. delta > 0 — остаток вырос (списали меньше, чем
  // думали), delta < 0 — уменьшился. Значение типа adjustment существовало в
  // enum с самого начала, но до сих пор не имело ни одного вызывающего.
  async adjust(warehouseId: string, materialId: string, delta: number, meta: MaterialStockMovementMeta): Promise<MaterialStockItem> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(materialStockItems)
        .where(and(eq(materialStockItems.warehouseId, warehouseId), eq(materialStockItems.materialId, materialId)))
        .limit(1);

      const target = existing
        ? existing
        : (
            await tx
              .insert(materialStockItems)
              .values({ warehouseId, materialId, quantityOnHand: "0" })
              .returning()
          )[0];
      if (!target) throw new Error("adjust: не удалось создать material_stock_items");

      const [row] = await tx
        .update(materialStockItems)
        .set({ quantityOnHand: String(Number(target.quantityOnHand) + delta), updatedAt: new Date() })
        .where(eq(materialStockItems.id, target.id))
        .returning();
      if (!row) throw new Error("adjust: UPDATE material_stock_items не вернул строку");

      await tx.insert(materialStockMovements).values({
        materialStockItemId: row.id,
        type: "adjustment",
        quantity: String(delta),
        referenceType: meta.referenceType ?? null,
        referenceId: meta.referenceId ?? null,
        createdBy: meta.createdBy ?? null,
      });

      return toMaterialStockItem(row);
    });
  }
}
