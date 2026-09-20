import type { NumericValuePreset, NumericValuePresetKind } from "../domain/preset";

export interface NewPresetInput {
  companyId: string;
  kind: NumericValuePresetKind;
  value: number;
  currency: string;
  createdBy: string | null;
}

export interface PresetRepository {
  // Идемпотентно: повторная вставка того же (companyId, kind, value, currency)
  // возвращает уже существующую строку, а не создаёт дубликат (ON CONFLICT DO
  // NOTHING + повторное чтение) — "повторный ввод значения просто выбирает
  // уже существующий пресет" (ПРОМПТ №3, раздел 5).
  findOrCreate(input: NewPresetInput): Promise<NumericValuePreset>;
  listByCompanyAndKind(companyId: string, kind: NumericValuePresetKind): Promise<NumericValuePreset[]>;
}
