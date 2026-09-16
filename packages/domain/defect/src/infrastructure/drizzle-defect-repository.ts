import { productionOrderDefectCompensations, productionOrderDefects, type Database } from "@garmentos/db-schema";
import { and, eq, inArray } from "drizzle-orm";
import type { DefectCompensation, ProductionOrderDefect } from "../domain/defect";
import type {
  DefectCompensationRepository,
  NewDefectCompensationInput,
  NewProductionOrderDefectInput,
  ProductionOrderDefectRepository,
} from "../application/ports";

type DbOrTx = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];
type DefectRow = typeof productionOrderDefects.$inferSelect;
type CompensationRow = typeof productionOrderDefectCompensations.$inferSelect;

function toDefect(row: DefectRow): ProductionOrderDefect {
  return {
    id: row.id,
    companyId: row.companyId,
    productionOrderId: row.productionOrderId,
    qcResultId: row.qcResultId,
    productVariantId: row.productVariantId,
    quantity: row.quantity,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toCompensation(row: CompensationRow): DefectCompensation {
  return {
    id: row.id,
    companyId: row.companyId,
    defectId: row.defectId,
    compensatingProductionOrderId: row.compensatingProductionOrderId,
    compensatingVariantId: row.compensatingVariantId,
    quantity: row.quantity,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export class DrizzleProductionOrderDefectRepository implements ProductionOrderDefectRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewProductionOrderDefectInput): Promise<ProductionOrderDefect> {
    const [row] = await this.db
      .insert(productionOrderDefects)
      .values({
        companyId: input.companyId,
        productionOrderId: input.productionOrderId,
        qcResultId: input.qcResultId,
        productVariantId: input.productVariantId ?? null,
        quantity: String(input.quantity),
        reason: input.reason ?? null,
        createdBy: input.createdBy,
      })
      .returning();
    if (!row) throw new Error("INSERT production_order_defects не вернул строку");
    return toDefect(row);
  }

  async createMany(inputs: NewProductionOrderDefectInput[]): Promise<ProductionOrderDefect[]> {
    const rows = await this.db
      .insert(productionOrderDefects)
      .values(
        inputs.map((input) => ({
          companyId: input.companyId,
          productionOrderId: input.productionOrderId,
          qcResultId: input.qcResultId,
          productVariantId: input.productVariantId ?? null,
          quantity: String(input.quantity),
          reason: input.reason ?? null,
          createdBy: input.createdBy,
        })),
      )
      .returning();
    return rows.map(toDefect);
  }

  async findById(companyId: string, id: string): Promise<ProductionOrderDefect | null> {
    const [row] = await this.db
      .select()
      .from(productionOrderDefects)
      .where(and(eq(productionOrderDefects.companyId, companyId), eq(productionOrderDefects.id, id)))
      .limit(1);
    return row ? toDefect(row) : null;
  }

  async listByProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrderDefect[]> {
    const rows = await this.db
      .select()
      .from(productionOrderDefects)
      .where(
        and(
          eq(productionOrderDefects.companyId, companyId),
          eq(productionOrderDefects.productionOrderId, productionOrderId),
        ),
      );
    return rows.map(toDefect);
  }

  async countByQcResult(companyId: string, qcResultId: string): Promise<number> {
    const rows = await this.db
      .select({ id: productionOrderDefects.id })
      .from(productionOrderDefects)
      .where(and(eq(productionOrderDefects.companyId, companyId), eq(productionOrderDefects.qcResultId, qcResultId)));
    return rows.length;
  }
}

export class DrizzleDefectCompensationRepository implements DefectCompensationRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewDefectCompensationInput): Promise<DefectCompensation> {
    const [row] = await this.db
      .insert(productionOrderDefectCompensations)
      .values({
        companyId: input.companyId,
        defectId: input.defectId,
        compensatingProductionOrderId: input.compensatingProductionOrderId,
        compensatingVariantId: input.compensatingVariantId ?? null,
        quantity: String(input.quantity),
        createdBy: input.createdBy,
      })
      .returning();
    if (!row) throw new Error("INSERT production_order_defect_compensations не вернул строку");
    return toCompensation(row);
  }

  async listByDefect(companyId: string, defectId: string): Promise<DefectCompensation[]> {
    const rows = await this.db
      .select()
      .from(productionOrderDefectCompensations)
      .where(
        and(
          eq(productionOrderDefectCompensations.companyId, companyId),
          eq(productionOrderDefectCompensations.defectId, defectId),
        ),
      );
    return rows.map(toCompensation);
  }

  async listByDefectIds(companyId: string, defectIds: string[]): Promise<DefectCompensation[]> {
    if (defectIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(productionOrderDefectCompensations)
      .where(
        and(
          eq(productionOrderDefectCompensations.companyId, companyId),
          inArray(productionOrderDefectCompensations.defectId, defectIds),
        ),
      );
    return rows.map(toCompensation);
  }
}
