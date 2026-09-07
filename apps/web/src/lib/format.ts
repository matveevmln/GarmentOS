/**
 * Форматирование чисел и дат для интерфейса.
 *
 * docs/UI_MIGRATION_PLAN.md, §3: компоненты дизайн-системы принимают
 * `number`/ISO-строку и форматируют внутри, а не получают готовую строку
 * из прототипа. Готовую строку нельзя ни сравнить, ни просуммировать, а
 * API отдаёт числа.
 *
 * Правила взяты из уже работающего кода apps/web (DashboardPage,
 * BatchPassportPage, NumberInput) — локаль ru-RU, неразрывные пробелы
 * как разделитель разрядов. Ничего нового не вводится; существующие
 * страницы на эти функции пока не переводятся (этапы 5-8).
 */

/** Валюта по умолчанию — сом (KGS): страна пошива в Pilot v1. Подпись
 *  передаётся вызывающим кодом, здесь только запасное значение. */
const DEFAULT_CURRENCY = "сом";

/** Денежная сумма. `decimals` по умолчанию 0 — как на дашборде; паспорт
 *  партии показывает копейки и передаёт 2 явно. */
export function formatMoney(amount: number, currency: string = DEFAULT_CURRENCY, decimals = 0): string {
  const num = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
  return currency ? `${num}\u00A0${currency}` : num;
}

/** Количество без валюты (штуки, метры, килограммы). */
export function formatQuantity(value: number, unit?: string, decimals = 0): string {
  const num = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(value);
  return unit ? `${num}\u00A0${unit}` : num;
}

/** Дата без времени. Пустое значение показываем прочерком, а не пустотой:
 *  иначе непонятно, дата отсутствует или экран не догрузился. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Единица измерения материала: ключ из справочника → русская подпись.
 *  Жила копиями на двух экранах; при появлении третьего места вынесена
 *  сюда, чтобы подписи не разъезжались. */
const UNIT_LABELS: Record<string, string> = { m: "м", kg: "кг", pcs: "шт" };

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

/** Тип материала: код из API → русская подпись в единственном числе
 *  («Ткань», а не «Ткани»): так подписывают одну строку материала. Списки
 *  фильтров держат свои подписи во множественном числе — это другая задача,
 *  туда эта функция не подходит. */
const MATERIAL_TYPE_LABELS: Record<string, string> = {
  fabric: "Ткань",
  trim: "Фурнитура",
  packaging: "Упаковка",
  accessory: "Прочее",
};

export function materialTypeLabel(type: string): string {
  return MATERIAL_TYPE_LABELS[type] ?? type;
}

/** Доля в процентах для полос в CostBreakdown. */
export function formatPercent(share: number, decimals = 0): string {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(share)}%`;
}
