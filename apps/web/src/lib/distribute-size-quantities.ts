// Зеркало серверного алгоритма распределения по процентам (ADR 0002,
// packages/domain/catalog/src/application/distribute-size-quantities.ts,
// distributeQuantityByPercent) — только для мгновенной обратной связи в
// форме A02, пока пользователь редактирует доли. apps/web не зависит от
// доменных пакетов (граница проекта — HTTP), поэтому небольшой чистый
// алгоритм здесь дублирован, а не импортирован. Окончательные числа,
// которые реально сохраняются, пересчитывает сервер при размещении заказа
// (POST /sewing-orders/:id/place) — эта копия никогда не участвует в записи.
//
// Метод наибольших остатков: целые части долей + остаток по убыванию
// дробной части, при равенстве — меньшему индексу ряда. Тот же тай-брейк,
// что и на сервере, поэтому предпросмотр совпадает с сохранённым результатом
// при неизменных входных данных.

export interface SizePercentRow {
  size: string;
  percent: number;
}

export interface SizeQuantityRow {
  size: string;
  quantity: number;
}

const PERCENT_SUM_TOLERANCE = 0.01;

export function percentSum(percentages: SizePercentRow[]): number {
  return percentages.reduce((sum, row) => sum + row.percent, 0);
}

export function isPercentSumValid(percentages: SizePercentRow[]): boolean {
  if (percentages.length === 0) return false;
  return Math.abs(percentSum(percentages) - 100) <= PERCENT_SUM_TOLERANCE;
}

function distributeByWeights(weights: number[], totalQuantity: number): number[] {
  const raw = weights.map((weight) => weight * totalQuantity);
  const base = raw.map(Math.floor);
  let remainder = totalQuantity - base.reduce((sum, value) => sum + value, 0);

  const remainders = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }));
  remainders.sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const quantities = [...base];
  for (const { index } of remainders) {
    if (remainder <= 0) break;
    quantities[index] = (quantities[index] ?? 0) + 1;
    remainder--;
  }
  return quantities;
}

// Предпросмотр — не бросает исключение на невалидном вводе (форма сама
// показывает предупреждение через isPercentSumValid/percentSum), возвращает
// null, если считать пока нечего/некорректно.
export function distributeQuantityByPercentPreview(
  percentages: SizePercentRow[],
  totalQuantity: number,
): SizeQuantityRow[] | null {
  if (!isPercentSumValid(percentages)) return null;
  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) return null;
  if (percentages.some((row) => row.percent < 0)) return null;

  const quantities = distributeByWeights(
    percentages.map((row) => row.percent / 100),
    totalQuantity,
  );
  return percentages.map((row, index) => ({ size: row.size, quantity: quantities[index] ?? 0 }));
}
