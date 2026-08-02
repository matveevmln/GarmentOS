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
