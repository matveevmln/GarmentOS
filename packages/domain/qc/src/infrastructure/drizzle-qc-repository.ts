import { productionOrderQcResults, type Database } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { QcResult } from "../domain/qc-result";
import type { NewQcResultInput, QcResultRepository } from "../application/ports";

type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof productionOrderQcResults.$inferSelect;

function toQcResult(row: Row): QcResult {
  return {
    id: row.id,
    companyId: row.companyId,
    productionOrderId: row.productionOrderId,
    receivedQuantity: row.receivedQuantity,
    goodQuantity: row.goodQuantity,
    defectQuantity: row.defectQuantity,
    comment: row.comment,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleQcResultRepository implements QcResultRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewQcResultInput): Promise<QcResult> {
    const [row] = await this.db
      .insert(productionOrderQcResults)
      .values({
        companyId: input.companyId,
        productionOrderId: input.productionOrderId,
        receivedQuantity: String(input.receivedQuantity),
        goodQuantity: String(input.goodQuantity),
        defectQuantity: String(input.defectQuantity),
        comment: input.comment,
        createdBy: input.createdBy,
      })
      .returning();
    if (!row) throw new Error("INSERT production_order_qc_results не вернул строку");
    return toQcResult(row);
  }

  async findByProductionOrder(companyId: string, productionOrderId: string): Promise<QcResult | null> {
    const [row] = await this.db
      .select()
      .from(productionOrderQcResults)
      .where(
        and(
          eq(productionOrderQcResults.companyId, companyId),
          eq(productionOrderQcResults.productionOrderId, productionOrderId),
        ),
      )
      .limit(1);
    return row ? toQcResult(row) : null;
  }
}
