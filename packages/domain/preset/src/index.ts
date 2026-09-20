// Публичный интерфейс модуля Preset (docs/REPOSITORY_STRUCTURE.md).

export type { NumericValuePreset, NumericValuePresetKind } from "./domain/preset";
export { NUMERIC_VALUE_PRESET_DEFAULTS, assertValidCurrency, assertValidPresetValue } from "./domain/preset";
export { DomainError } from "./domain/errors";

export type { NewPresetInput, PresetRepository } from "./application/ports";
export { addPreset, type AddPresetDeps } from "./application/add-preset";
export { listPresets, type ListPresetsDeps } from "./application/list-presets";

export { DrizzlePresetRepository } from "./infrastructure/drizzle-preset-repository";
