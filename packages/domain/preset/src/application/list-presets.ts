import { NUMERIC_VALUE_PRESET_DEFAULTS, type NumericValuePreset, type NumericValuePresetKind } from "../domain/preset";
import type { PresetRepository } from "./ports";

export interface ListPresetsDeps {
  presets: PresetRepository;
}

// Компании, созданные ДО сида миграции 0033 или вообще без сида (например,
// bootstrap-company в новом окружении) не должны видеть пустой список —
// первое обращение прозрачно досеивает те же стартовые значения, что и
// миграция для уже существующих компаний (ПРОМПТ №3, раздел 5).
export async function listPresets(
  deps: ListPresetsDeps,
  input: { companyId: string; kind: NumericValuePresetKind },
): Promise<NumericValuePreset[]> {
  const existing = await deps.presets.listByCompanyAndKind(input.companyId, input.kind);
  if (existing.length > 0) {
    return existing;
  }

  for (const seed of NUMERIC_VALUE_PRESET_DEFAULTS[input.kind]) {
    await deps.presets.findOrCreate({ companyId: input.companyId, kind: input.kind, value: seed.value, currency: seed.currency, createdBy: null });
  }
  return deps.presets.listByCompanyAndKind(input.companyId, input.kind);
}
