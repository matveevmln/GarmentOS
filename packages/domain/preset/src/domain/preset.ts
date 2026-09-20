import { DomainError } from "./errors";

// Два независимых набора (ПРОМПТ №3, раздел 5) — "стоимость пошива"
// (производственная себестоимость заказа) и "цена спецификации" (документная
// цена) не должны смешиваться нигде, включая этот справочник: одна таблица,
// но kind разделяет наборы жёстко на уровне запроса (listByCompanyAndKind
// всегда фильтрует по конкретному kind, никогда не отдаёт оба сразу).
export type NumericValuePresetKind = "sewing_cost" | "specification_price";

export const NUMERIC_VALUE_PRESET_DEFAULTS: Record<NumericValuePresetKind, Array<{ value: number; currency: string }>> = {
  sewing_cost: [
    { value: 350, currency: "KGS" },
    { value: 380, currency: "KGS" },
    { value: 450, currency: "KGS" },
  ],
  specification_price: [{ value: 700, currency: "RUB" }],
};

export interface NumericValuePreset {
  id: string;
  companyId: string;
  kind: NumericValuePresetKind;
  value: string;
  currency: string;
  createdBy: string | null;
  createdAt: Date;
}

export function assertValidPresetValue(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DomainError(`Значение пресета должно быть положительным числом (получено ${value})`, "PRESET_VALUE_INVALID");
  }
}

export function assertValidCurrency(currency: string): void {
  if (!currency.trim()) {
    throw new DomainError("Валюта пресета не может быть пустой", "PRESET_CURRENCY_INVALID");
  }
}
