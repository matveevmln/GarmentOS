// Числа в спецификации форматируются по-русски (эталон 2026-07-26: "225 000,00",
// "3 050") — пробел как разделитель разрядов, запятая как десятичный
// разделитель. Intl.NumberFormat("ru-RU") даёт неразрывный пробел (U+00A0),
// заменяем на обычный — иначе visual diff в PDF не сравнить построчно.
const NBSP = " ";

export function formatRuAmount(value: number): string {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(value)
    .replaceAll(NBSP, " ");
}

export function formatRuQuantity(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value).replaceAll(NBSP, " ");
}

// Даты хранятся в БД как ISO ("2026-04-10"), эталон 2026-07-26 показывает
// русский формат ("22.04.2026"). Значения, которые уже не выглядят как ISO
// (пусто, либо кем-то введённый произвольный текст), возвращаются как есть —
// не ломаем неожиданный ввод молчаливым "Invalid Date".
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/;

export function formatRuDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}
