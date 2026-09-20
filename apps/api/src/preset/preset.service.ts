import { Inject, Injectable } from "@nestjs/common";
import { addPreset, listPresets, type NumericValuePreset, type NumericValuePresetKind, type PresetRepository } from "@garmentos/domain-preset";
import { PRESET_REPOSITORY } from "./preset.tokens";

// Сохраняемые числовые значения — "стоимость пошива" / "цена спецификации"
// (ПРОМПТ №3, раздел 5): владелец один раз вводит новое значение, дальше оно
// доступно как готовый вариант выбора (минимум клика, принцип 17). Тонкий
// presentation-адаптер поверх packages/domain/preset — тот же паттерн, что и
// остальные Service в apps/api.
@Injectable()
export class PresetService {
  constructor(@Inject(PRESET_REPOSITORY) private readonly presets: PresetRepository) {}

  async add(companyId: string, kind: NumericValuePresetKind, value: number, currency: string, createdBy: string | null): Promise<NumericValuePreset> {
    return addPreset({ presets: this.presets }, { companyId, kind, value, currency, createdBy });
  }

  async list(companyId: string, kind: NumericValuePresetKind): Promise<NumericValuePreset[]> {
    return listPresets({ presets: this.presets }, { companyId, kind });
  }
}
