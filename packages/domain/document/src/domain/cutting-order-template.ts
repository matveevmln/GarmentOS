// Раскройное задание — второй документ Document Template Engine (владелец
// проекта, 2026-08-30). Второго генератора не заводится: используются те же
// шрифты, геометрия страницы и отрисовка таблицы, что у спецификации;
// отличается только форма таблицы — колонка на каждый цвет.

/** Колонка таблицы. Ключ свободный: у матрицы кроя их столько, сколько цветов. */
export interface TableColumn {
  key: string;
  label: string;
  width: number; // pt
  align: "left" | "center" | "right";
}

export interface CuttingOrderDocumentData {
  /** «КРОЙ СТЕГАНКА · 4542 ед · 3 ЦВЕТА» */
  title: string;
  /** Строки под заголовком: заказ, цех, срок, исполнитель. */
  subtitleLines: string[];
  /** Порядок цветов = порядок колонок матрицы. */
  colors: string[];
  /** Строки матрицы: размер и количество по каждому цвету. */
  rows: Array<{ size: string; quantities: string[] }>;
  /** Итог по каждому цвету. */
  totals: string[];
  /** «Материалы: стёганка 11 809,2 м · подклад 8 175,6 м» и примечания. */
  footerLines: string[];
}

const CONTENT_WIDTH = 522; // 612 - 45*2, та же ширина, что у спецификации
const SIZE_COLUMN_WIDTH = 96;

// Ширины считаются в момент генерации: число колонок зависит от числа цветов
// в конкретной партии, поэтому статичным шаблоном их не описать.
export function buildCuttingOrderColumns(colors: string[]): TableColumn[] {
  const perColor = colors.length > 0 ? (CONTENT_WIDTH - SIZE_COLUMN_WIDTH) / colors.length : CONTENT_WIDTH;
  return [
    { key: "size", label: "Размер", width: SIZE_COLUMN_WIDTH, align: "left" },
    ...colors.map((color, index) => ({
      key: `c${index}`,
      label: color,
      width: perColor,
      align: "right" as const,
    })),
  ];
}
