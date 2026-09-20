import { numericValuePresets, type DbOrTx } from "@garmentos/db-schema";
import { and, asc, eq } from "drizzle-orm";
import type { NumericValuePreset, NumericValuePresetKind } from "../domain/preset";
import type { NewPresetInput, PresetRepository } from "../application/ports";

type PresetRow = typeof numericValuePresets.$inferSelect;

function toPreset(row: PresetRow): NumericValuePreset {
  return {
    id: row.id,
    companyId: row.companyId,
    kind: row.kind,
    value: row.value,
    currency: row.currency,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

export class DrizzlePresetRepository implements PresetRepository {
  constructor(private readonly db: DbOrTx) {}

  async findOrCreate(input: NewPresetInput): Promise<NumericValuePreset> {
    const [inserted] = await this.db
      .insert(numericValuePresets)
      .values({
        companyId: input.companyId,
        kind: input.kind,
        value: String(input.value),
        currency: input.currency,
        createdBy: input.createdBy,
      })
      .onConflictDoNothing({
        target: [numericValuePresets.companyId, numericValuePresets.kind, numericValuePresets.value, numericValuePresets.currency],
      })
      .returning();
    if (inserted) return toPreset(inserted);

    // Конфликт — строка уже существует, читаем её (findOrCreate обязан
    // вернуть значение, а не молчаливо ничего).
    const [existing] = await this.db
      .select()
      .from(numericValuePresets)
      .where(
        and(
          eq(numericValuePresets.companyId, input.companyId),
          eq(numericValuePresets.kind, input.kind),
          eq(numericValuePresets.value, String(input.value)),
          eq(numericValuePresets.currency, input.currency),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("INSERT ... ON CONFLICT DO NOTHING не вернул строку и повторное чтение её не нашло");
    return toPreset(existing);
  }

  async listByCompanyAndKind(companyId: string, kind: NumericValuePresetKind): Promise<NumericValuePreset[]> {
    const rows = await this.db
      .select()
      .from(numericValuePresets)
      .where(and(eq(numericValuePresets.companyId, companyId), eq(numericValuePresets.kind, kind)))
      .orderBy(asc(numericValuePresets.value));
    return rows.map(toPreset);
  }
}
