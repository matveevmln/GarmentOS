import {
  cuttingOrderMaterials,
  cuttingOrderResults,
  cuttingOrders,
  type Database,
} from "@garmentos/db-schema";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type {
  CuttingOrder,
  CuttingOrderMaterial,
  CuttingOrderResult,
  CuttingOrderStatus,
} from "../domain/cutting-order";
import type {
  CuttingOrderMaterialFactInput,
  CuttingOrderRepository,
  CuttingOrderResultFactInput,
  NewCuttingOrderInput,
} from "../application/ports";

type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
type OrderRow = typeof cuttingOrders.$inferSelect;
type MaterialRow = typeof cuttingOrderMaterials.$inferSelect;
type ResultRow = typeof cuttingOrderResults.$inferSelect;

function toMaterial(row: MaterialRow): CuttingOrderMaterial {
  return {
    id: row.id,
    cuttingOrderId: row.cuttingOrderId,
    materialId: row.materialId,
    unit: row.unit,
    requiredQuantity: row.requiredQuantity,
    allocatedQuantity: row.allocatedQuantity,
    consumedQuantity: row.consumedQuantity,
    rollNote: row.rollNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toResult(row: ResultRow): CuttingOrderResult {
  return {
    id: row.id,
    cuttingOrderId: row.cuttingOrderId,
    productVariantId: row.productVariantId,
    plannedQuantity: row.plannedQuantity,
    actualQuantity: row.actualQuantity,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCuttingOrder(row: OrderRow, materials: MaterialRow[], results: ResultRow[]): CuttingOrder {
  return {
    id: row.id,
    companyId: row.companyId,
    productionOrderId: row.productionOrderId,
    number: row.number,
    status: row.status,
    executorType: row.executorType,
    executorWorkshopId: row.executorWorkshopId,
    issuedAt: row.issuedAt,
    completedAt: row.completedAt,
    comment: row.comment,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    materials: materials.map(toMaterial),
    results: results.map(toResult),
  };
}

export class DrizzleCuttingOrderRepository implements CuttingOrderRepository {
  constructor(private readonly db: DbOrTx) {}

  private async loadChildren(tx: DbOrTx, orderIds: string[]): Promise<{ materials: MaterialRow[]; results: ResultRow[] }> {
    if (orderIds.length === 0) return { materials: [], results: [] };
    const [materials, results] = await Promise.all([
      tx.select().from(cuttingOrderMaterials).where(inArray(cuttingOrderMaterials.cuttingOrderId, orderIds)),
      tx.select().from(cuttingOrderResults).where(inArray(cuttingOrderResults.cuttingOrderId, orderIds)),
    ]);
    return { materials, results };
  }

  private async hydrate(row: OrderRow): Promise<CuttingOrder> {
    const { materials, results } = await this.loadChildren(this.db, [row.id]);
    return toCuttingOrder(row, materials, results);
  }

  async create(input: NewCuttingOrderInput): Promise<CuttingOrder> {
    return this.db.transaction(async (tx) => {
      const [orderRow] = await tx
        .insert(cuttingOrders)
        .values({
          companyId: input.companyId,
          productionOrderId: input.productionOrderId,
          number: input.number,
          status: "draft",
          executorType: input.executorType,
          executorWorkshopId: input.executorWorkshopId,
          comment: input.comment,
          createdBy: input.createdBy,
        })
        .returning();
      if (!orderRow) throw new Error("INSERT cutting_orders не вернул строку");

      const materialRows = input.materials.length
        ? await tx
            .insert(cuttingOrderMaterials)
            .values(
              input.materials.map((material) => ({
                cuttingOrderId: orderRow.id,
                materialId: material.materialId,
                unit: material.unit,
                requiredQuantity: String(material.requiredQuantity),
                allocatedQuantity: material.allocatedQuantity === null ? null : String(material.allocatedQuantity),
                rollNote: material.rollNote,
              })),
            )
            .returning()
        : [];

      const resultRows = input.results.length
        ? await tx
            .insert(cuttingOrderResults)
            .values(
              input.results.map((result) => ({
                cuttingOrderId: orderRow.id,
                productVariantId: result.productVariantId,
                plannedQuantity: String(result.plannedQuantity),
              })),
            )
            .returning()
        : [];

      return toCuttingOrder(orderRow, materialRows, resultRows);
    });
  }

  async findById(companyId: string, id: string): Promise<CuttingOrder | null> {
    const [row] = await this.db
      .select()
      .from(cuttingOrders)
      .where(and(eq(cuttingOrders.companyId, companyId), eq(cuttingOrders.id, id)))
      .limit(1);
    return row ? this.hydrate(row) : null;
  }

  async listByProductionOrder(companyId: string, productionOrderId: string): Promise<CuttingOrder[]> {
    const rows = await this.db
      .select()
      .from(cuttingOrders)
      .where(
        and(eq(cuttingOrders.companyId, companyId), eq(cuttingOrders.productionOrderId, productionOrderId)),
      )
      .orderBy(asc(cuttingOrders.number));
    const { materials, results } = await this.loadChildren(this.db, rows.map((row) => row.id));
    return rows.map((row) =>
      toCuttingOrder(
        row,
        materials.filter((material) => material.cuttingOrderId === row.id),
        results.filter((result) => result.cuttingOrderId === row.id),
      ),
    );
  }

  async countByProductionOrder(companyId: string, productionOrderId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(cuttingOrders)
      .where(
        and(eq(cuttingOrders.companyId, companyId), eq(cuttingOrders.productionOrderId, productionOrderId)),
      );
    return row?.value ?? 0;
  }

  async updateStatus(
    id: string,
    status: CuttingOrderStatus,
    timestamps: { issuedAt?: Date; completedAt?: Date },
  ): Promise<CuttingOrder> {
    const [row] = await this.db
      .update(cuttingOrders)
      .set({
        status,
        ...(timestamps.issuedAt ? { issuedAt: timestamps.issuedAt } : {}),
        ...(timestamps.completedAt ? { completedAt: timestamps.completedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(cuttingOrders.id, id))
      .returning();
    if (!row) throw new Error(`UPDATE cutting_orders не нашёл строку id=${id}`);
    return this.hydrate(row);
  }

  async updateAllocations(
    id: string,
    rows: Array<{ materialId: string; allocatedQuantity: number | null; rollNote: string | null }>,
  ): Promise<CuttingOrder> {
    return this.db.transaction(async (tx) => {
      for (const row of rows) {
        await tx
          .update(cuttingOrderMaterials)
          .set({
            allocatedQuantity: row.allocatedQuantity === null ? null : String(row.allocatedQuantity),
            rollNote: row.rollNote,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cuttingOrderMaterials.cuttingOrderId, id),
              eq(cuttingOrderMaterials.materialId, row.materialId),
            ),
          );
      }
      const [orderRow] = await tx.select().from(cuttingOrders).where(eq(cuttingOrders.id, id)).limit(1);
      if (!orderRow) throw new Error(`cutting_orders не найден id=${id}`);
      const { materials, results } = await this.loadChildren(tx, [id]);
      return toCuttingOrder(orderRow, materials, results);
    });
  }

  async recordFact(
    id: string,
    materials: CuttingOrderMaterialFactInput[],
    results: CuttingOrderResultFactInput[],
  ): Promise<CuttingOrder> {
    return this.db.transaction(async (tx) => {
      for (const material of materials) {
        await tx
          .update(cuttingOrderMaterials)
          .set({
            consumedQuantity: String(material.consumedQuantity),
            // rollNote не затирается, если его не прислали: комментарий про
            // рулоны мог быть внесён ещё при выдаче в крой.
            ...(material.rollNote === undefined ? {} : { rollNote: material.rollNote }),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(cuttingOrderMaterials.cuttingOrderId, id),
              eq(cuttingOrderMaterials.materialId, material.materialId),
            ),
          );
      }
      for (const result of results) {
        await tx
          .update(cuttingOrderResults)
          .set({ actualQuantity: String(result.actualQuantity), updatedAt: new Date() })
          .where(
            and(
              eq(cuttingOrderResults.cuttingOrderId, id),
              eq(cuttingOrderResults.productVariantId, result.productVariantId),
            ),
          );
      }
      const [orderRow] = await tx.select().from(cuttingOrders).where(eq(cuttingOrders.id, id)).limit(1);
      if (!orderRow) throw new Error(`cutting_orders не найден id=${id}`);
      const { materials: materialRows, results: resultRows } = await this.loadChildren(tx, [id]);
      return toCuttingOrder(orderRow, materialRows, resultRows);
    });
  }
}
