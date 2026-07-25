import { inventoryCounts, inventoryCountItems, type DbOrTx } from "@garmentos/db-schema";
import { eq } from "drizzle-orm";
import type { InventoryCount, InventoryCountItem, InventoryCountStatus } from "../domain/inventory-count";
import type { InventoryCountRepository } from "../application/ports";

type InventoryCountRow = typeof inventoryCounts.$inferSelect;
type InventoryCountItemRow = typeof inventoryCountItems.$inferSelect;

function toInventoryCountItem(row: InventoryCountItemRow): InventoryCountItem {
  return {
    id: row.id,
    inventoryCountId: row.inventoryCountId,
    productVariantId: row.productVariantId,
    expectedQuantity: row.expectedQuantity,
    actualQuantity: row.actualQuantity,
    discrepancy: row.discrepancy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toInventoryCount(row: InventoryCountRow, items: InventoryCountItemRow[]): InventoryCount {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    status: row.status,
    performedBy: row.performedBy,
    performedAt: row.performedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map(toInventoryCountItem),
  };
}

export class DrizzleInventoryCountRepository implements InventoryCountRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(warehouseId: string, performedBy: string | null): Promise<InventoryCount> {
    const [row] = await this.db.insert(inventoryCounts).values({ warehouseId, performedBy }).returning();
    if (!row) throw new Error("INSERT inventory_counts не вернул строку");
    return toInventoryCount(row, []);
  }

  async findById(id: string): Promise<InventoryCount | null> {
    const [row] = await this.db.select().from(inventoryCounts).where(eq(inventoryCounts.id, id)).limit(1);
    if (!row) return null;
    const itemRows = await this.db.select().from(inventoryCountItems).where(eq(inventoryCountItems.inventoryCountId, row.id));
    return toInventoryCount(row, itemRows);
  }

  async addItem(
    inventoryCountId: string,
    productVariantId: string,
    expectedQuantity: number,
    actualQuantity: number,
    discrepancy: number,
  ): Promise<InventoryCount> {
    await this.db.insert(inventoryCountItems).values({
      inventoryCountId,
      productVariantId,
      expectedQuantity: String(expectedQuantity),
      actualQuantity: String(actualQuantity),
      discrepancy: String(discrepancy),
    });

    const [row] = await this.db.select().from(inventoryCounts).where(eq(inventoryCounts.id, inventoryCountId)).limit(1);
    if (!row) throw new Error(`addItem: inventory_counts не найден id=${inventoryCountId}`);
    const itemRows = await this.db.select().from(inventoryCountItems).where(eq(inventoryCountItems.inventoryCountId, row.id));
    return toInventoryCount(row, itemRows);
  }

  async updateStatus(id: string, status: InventoryCountStatus, performedAt: Date | null): Promise<InventoryCount> {
    const [row] = await this.db
      .update(inventoryCounts)
      .set({ status, updatedAt: new Date(), ...(performedAt !== null ? { performedAt } : {}) })
      .where(eq(inventoryCounts.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE inventory_counts не нашёл строку id=${id}`);
    const itemRows = await this.db.select().from(inventoryCountItems).where(eq(inventoryCountItems.inventoryCountId, row.id));
    return toInventoryCount(row, itemRows);
  }
}
