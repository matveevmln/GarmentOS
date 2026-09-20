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

// Отдельно от formatRuAmount — строка "Общая сумма Спецификации №N
// составляет: X руб." под таблицей в эталоне (ПРОМПТ №2.2) показывает сумму
// БЕЗ копеек ("2 800 000 руб."), в отличие от строки "Итого" внутри самой
// таблицы ("2 800 000,00").
export function formatRuAmountNoDecimals(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value).replaceAll(NBSP, " ");
}

export function formatRuQuantity(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(value).replaceAll(NBSP, " ");
}

// Строка "Итого" в таблице спецификации — количество БЕЗ разделителя
// разрядов ("4000", не "4 000"), в отличие от formatRuQuantity, которым
// форматируется количество в каждой обычной строке. Денежные суммы (в т.ч.
// "Итого" по сумме) продолжают идти через formatRuAmount с разделителем —
// эталон разделяет разряды только у денег, не у штук (ПРОМПТ №11.4,
// владелец проекта, 2026-09-19: "Итого 4000 2 800 000,00").
export function formatRuQuantityNoGrouping(value: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3, useGrouping: false }).format(value);
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

const RU_MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// Формат "30 сентября 2026" — только для пункта 3 "Период поставки"
// (ПРОМПТ №10.3, владелец проекта: "укажи тестовое значение в формате
// эталона, например: «до 30 сентября 2026 г.»") — единственное место,
// где нужен развёрнутый формат даты; везде в остальном документе (пункты
// договора, заголовок) используется formatRuDate (dd.mm.yyyy), это не
// заменяет её.
export function formatRuDateLong(value: string | null | undefined): string {
  if (!value) return "";
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthName = RU_MONTHS_GENITIVE[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthName} ${year}`;
}

// Пункт 3 "Период поставки" — когда срок ещё не согласован (dueDate не
// задан), эталон не пропускает поле и не показывает пусто: печатается
// линия под рукописную дату + известный год (ПРОМПТ №11.4, владелец
// проекта, 2026-09-19, измерено по эталону: 20 символов "_", ширина
// сегмента 90pt — та же ширина, что и у линии подписи). fallbackYear —
// год создания спецификации (единственный уже известный системе факт),
// не текущий календарный год и не хардкод "2026".
export function formatDeliveryPeriodText(dueDate: string | null | undefined, fallbackYear: string): string {
  if (dueDate) return formatRuDateLong(dueDate);
  return `${"_".repeat(20)} ${fallbackYear}`;
}
