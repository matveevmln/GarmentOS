import { markingCodes, markingCodeEvents, type DbOrTx } from "@garmentos/db-schema";
import { and, eq } from "drizzle-orm";
import type { MarkingCode, MarkingCodeStatus } from "../domain/marking-code";
import type { MarkingCodeRepository, MarkingCodeTransitionEvent, NewMarkingCodeInput } from "../application/ports";

type MarkingCodeRow = typeof markingCodes.$inferSelect;

function toMarkingCode(row: MarkingCodeRow): MarkingCode {
  return {
    id: row.id,
    companyId: row.companyId,
    productVariantId: row.productVariantId,
    codeValue: row.codeValue,
    status: row.status,
    productionOrderId: row.productionOrderId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleMarkingCodeRepository implements MarkingCodeRepository {
  constructor(private readonly db: DbOrTx) {}

  async create(input: NewMarkingCodeInput): Promise<MarkingCode> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(markingCodes)
        .values({
          companyId: input.companyId,
          productVariantId: input.productVariantId,
          codeValue: input.codeValue,
          productionOrderId: input.productionOrderId,
        })
        .returning();
      if (!row) throw new Error("INSERT marking_codes не вернул строку");

      await tx.insert(markingCodeEvents).values({
        markingCodeId: row.id,
        eventType: "issued",
        referenceType: null,
        referenceId: null,
        payloadJson: null,
      });

      return toMarkingCode(row);
    });
  }

  async findById(companyId: string, id: string): Promise<MarkingCode | null> {
    const [row] = await this.db
      .select()
      .from(markingCodes)
      .where(and(eq(markingCodes.companyId, companyId), eq(markingCodes.id, id)))
      .limit(1);
    return row ? toMarkingCode(row) : null;
  }

  async findByCodeValue(codeValue: string): Promise<MarkingCode | null> {
    const [row] = await this.db.select().from(markingCodes).where(eq(markingCodes.codeValue, codeValue)).limit(1);
    return row ? toMarkingCode(row) : null;
  }

  async transition(id: string, status: MarkingCodeStatus, event: MarkingCodeTransitionEvent): Promise<MarkingCode> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(markingCodes)
        .set({ status, updatedAt: new Date() })
        .where(eq(markingCodes.id, id))
        .returning();
      if (!row) throw new Error(`UPDATE marking_codes не нашёл строку id=${id}`);

      await tx.insert(markingCodeEvents).values({
        markingCodeId: row.id,
        eventType: event.eventType,
        referenceType: event.referenceType ?? null,
        referenceId: event.referenceId ?? null,
        payloadJson: event.payloadJson ?? null,
      });

      return toMarkingCode(row);
    });
  }
}
