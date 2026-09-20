import { assertValidCurrency, assertValidPresetValue, type NumericValuePreset } from "../domain/preset";
import type { NewPresetInput, PresetRepository } from "./ports";

export interface AddPresetDeps {
  presets: PresetRepository;
}

// "Добавление нового значения должно сохранять его для последующего
// использования" (ПРОМПТ №3, раздел 5) — findOrCreate: если такое значение
// уже есть, возвращает существующую строку, не плодит дубликаты.
export async function addPreset(deps: AddPresetDeps, input: NewPresetInput): Promise<NumericValuePreset> {
  assertValidPresetValue(input.value);
  assertValidCurrency(input.currency);
  return deps.presets.findOrCreate(input);
}
