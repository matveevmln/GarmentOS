import { boms, bomItems, type DbOrTx } from "@garmentos/db-schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Bom, BomItem, BomStatus } from "../domain/bom";
import type { BomRepository, NewBomInput } from "../application/ports";

type BomRow = typeof boms.$inferSelect;
type BomItemRow = typeof bomItems.$inferSelect;

function toBomItem(row: BomItemRow): BomItem {
  return {
    id: row.id,
    bomId: row.bomId,
    materialId: row.materialId,
    quantityPerUnit: row.quantityPerUnit,
    wastePercent: row.wastePercent,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toBom(row: BomRow, items: BomItemRow[]): Bom {
  return {
    id: row.id,
    companyId: row.companyId,
    productId: row.productId,
    version: row.version,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    items: items.map(toBomItem),
  };
}

export class DrizzleBomRepository implements BomRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewBomInput): Promise<Bom> {
    return this.db.transaction(async (tx) => {
      const [bomRow] = await tx
        .insert(boms)
        .values({
          companyId: input.companyId,
          productId: input.productId,
          version: input.version,
          status: input.status,
          createdBy: input.createdBy,
        })
        .returning();
      if (!bomRow) throw new Error("INSERT boms не вернул строку");

      const itemRows = await tx
        .insert(bomItems)
        .values(
          input.items.map((item) => ({
            bomId: bomRow.id,
            materialId: item.materialId,
            quantityPerUnit: String(item.quantityPerUnit),
            ...(item.wastePercent !== undefined ? { wastePercent: String(item.wastePercent) } : {}),
          })),
        )
        .returning();

      return toBom(bomRow, itemRows);
    });
  }

  async findById(companyId: string, id: string): Promise<Bom | null> {
    const [bomRow] = await this.db
      .select()
      .from(boms)
      .where(and(eq(boms.companyId, companyId), eq(boms.id, id)))
      .limit(1);
    if (!bomRow) return null;

    const itemRows = await this.db.select().from(bomItems).where(eq(bomItems.bomId, bomRow.id));
    return toBom(bomRow, itemRows);
  }

  async countByProduct(companyId: string, productId: string): Promise<number> {
    const rows = await this.db
      .select({ id: boms.id })
      .from(boms)
      .where(and(eq(boms.companyId, companyId), eq(boms.productId, productId)));
    return rows.length;
  }

  async updateStatus(id: string, status: BomStatus): Promise<Bom> {
    const [bomRow] = await this.db.update(boms).set({ status, updatedAt: new Date() }).where(eq(boms.id, id)).returning();
    if (!bomRow) throw new Error(`UPDATE boms не нашёл строку id=${id}`);

    const itemRows = await this.db.select().from(bomItems).where(eq(bomItems.bomId, bomRow.id));
    return toBom(bomRow, itemRows);
  }

  async findLatestApproved(companyId: string, productId: string): Promise<Bom | null> {
    const [bomRow] = await this.db
      .select()
      .from(boms)
      .where(and(eq(boms.companyId, companyId), eq(boms.productId, productId), eq(boms.status, "approved")))
      .orderBy(desc(boms.version))
      .limit(1);
    if (!bomRow) return null;

    const itemRows = await this.db.select().from(bomItems).where(eq(bomItems.bomId, bomRow.id));
    return toBom(bomRow, itemRows);
  }

  async listByProduct(companyId: string, productId: string): Promise<Bom[]> {
    const bomRows = await this.db
      .select()
      .from(boms)
      .where(and(eq(boms.companyId, companyId), eq(boms.productId, productId)))
      .orderBy(desc(boms.version));
    if (bomRows.length === 0) return [];

    const itemRows = await this.db
      .select()
      .from(bomItems)
      .where(
        inArray(
          bomItems.bomId,
          bomRows.map((row) => row.id),
        ),
      );

    return bomRows.map((bomRow) => toBom(bomRow, itemRows.filter((item) => item.bomId === bomRow.id)));
  }
}
