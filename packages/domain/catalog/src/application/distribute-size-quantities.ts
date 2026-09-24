import { DomainError } from "../domain/errors";

export interface SizeQuantity {
  size: string;
  quantity: number;
}

// ЗАПАСНОЙ путь распределения — применяется только когда у модели не задана
// раскладка (product_sizes). Основной механизм — distributeQuantityByRatio
// ниже, по весам из карточки модели (владелец проекта, 2026-08-30).
//
// Правило: средние размеры получают суммарно 60% объёма, крайние делят 40%.
// Важное свойство, из-за которого оно и перестало быть бизнес-правилом: при
// РОВНО пяти размерах доли вырождаются в равные (0.4/2 = 0.6/3 = 0.2), то есть
// на реальной сетке «Стеганки» (48-50 … 64-66) правило даёт 303/303/303/303/302
// вместо нужных 185/381/381/381/186. Держать это как «умолчание системы»
// нельзя — числа финансово значимые.
//
// `sizes` должен быть уже упорядочен от меньшего к большему: порядок здесь не
// выводится из строк ("S"/"M"/"L" не сортируются алфавитно корректно).
const CORE_TIER_SHARE = 0.6;
const TAIL_TIER_SHARE = 0.4;

export function distributeQuantityBySize(sizes: string[], totalQuantity: number): SizeQuantity[] {
  if (sizes.length === 0) {
    throw new DomainError("Нет ни одного размера для распределения количества", "SIZE_DISTRIBUTION_EMPTY");
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
    throw new DomainError(
      `Общее количество должно быть положительным целым числом (получено ${totalQuantity})`,
      "SIZE_DISTRIBUTION_QUANTITY_INVALID",
    );
  }

  const weights = computeWeights(sizes.length);
  return roundToExactTotal(sizes, weights, totalQuantity);
}

// 1-2 размера — делим поровну (тиры "хвост"/"ядро" не имеют смысла без
// хотя бы одного среднего размера между крайними).
function computeWeights(sizeCount: number): number[] {
  if (sizeCount <= 2) {
    return Array<number>(sizeCount).fill(1 / sizeCount);
  }

  const coreCount = sizeCount - 2;
  const tailWeight = TAIL_TIER_SHARE / 2;
  const coreWeight = CORE_TIER_SHARE / coreCount;

  return [tailWeight, ...Array<number>(coreCount).fill(coreWeight), tailWeight];
}

// Largest remainder method — веса в доли не обязаны давать целые количества,
// сумма округлённых значений должна точно равняться totalQuantity (иначе
// «3000 шт.» в спецификации разъедется с фактической суммой строк).
function roundToExactTotal(sizes: string[], weights: number[], totalQuantity: number): SizeQuantity[] {
  const quantities = distributeByWeights(weights, totalQuantity);
  return sizes.map((size, index) => ({ size, quantity: quantities[index] ?? 0 }));
}

function distributeByWeights(weights: number[], totalQuantity: number): number[] {
  const raw = weights.map((weight) => weight * totalQuantity);
  const base = raw.map(Math.floor);
  let remainder = totalQuantity - base.reduce((sum, value) => sum + value, 0);

  // Тай-брейк задан явно, а не отдан на откуп стабильности сортировки:
  // при равных дробных частях единица уходит размеру, идущему раньше в ряду.
  // Один и тот же вход обязан давать один и тот же выход — числа попадают
  // в спецификацию и раскройное задание (владелец проекта, 2026-08-30).
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

// Раскладка по весам, заданным в карточке модели (владелец проекта,
// 2026-08-30) — основной механизм распределения на всех входах системы.
//
// Веса — рабочие числа владельца, а не проценты: для «Стеганки» это
// 185/381/381/381/186. Сумма весов ничему не равна и не обязана равняться
// 100 — важны только их соотношения, количество масштабируется на любой
// объём: 1514 → 185/381/381/381/186, 500 → 61/126/126/126/61.
//
// Порядок размеров задаёт вызывающий (product_sizes.sort_order); строки
// «S»/«M»/«L» здесь не сортируются — алфавитный порядок для размеров неверен.
export interface SizeRatio {
  size: string;
  weight: number;
}

export function distributeQuantityByRatio(ratios: SizeRatio[], totalQuantity: number): SizeQuantity[] {
  if (ratios.length === 0) {
    throw new DomainError("Нет ни одного размера для распределения количества", "SIZE_DISTRIBUTION_EMPTY");
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
    throw new DomainError(
      `Общее количество должно быть положительным целым числом (получено ${totalQuantity})`,
      "SIZE_DISTRIBUTION_QUANTITY_INVALID",
    );
  }
  for (const ratio of ratios) {
    if (!(ratio.weight > 0)) {
      throw new DomainError(
        `Вес размера "${ratio.size}" должен быть положительным (получено ${ratio.weight})`,
        "SIZE_RATIO_WEIGHT_INVALID",
      );
    }
  }

  const totalWeight = ratios.reduce((sum, ratio) => sum + ratio.weight, 0);
  const quantities = distributeByWeights(
    ratios.map((ratio) => ratio.weight / totalWeight),
    totalQuantity,
  );
  return ratios.map((ratio, index) => ({ size: ratio.size, quantity: quantities[index] ?? 0 }));
}

// Проценты редактора долей заказа (ADR 0002, «Штаб партии v1», владелец
// проекта, 2026-09-24; docs/GOS-PARTY-V1.md, раздел 5) — НЕ то же самое, что
// SizeRatio выше: веса раскладки модели произвольны и не обязаны давать 100,
// а проценты шаблона заказа обязаны — пользователь редактирует именно доли
// целого, и число, которое не сходится в 100%, означает ошибку ввода, а не
// «просто другой масштаб». Пример владельца: 12,5/25/25/25/12,5% → на 600
// даёт 75/150/150/150/75, на 400 — 50/100/100/100/50. Метод округления —
// тот же largest remainder, тай-брейк по возрастанию индекса ряда.
export interface SizePercent {
  size: string;
  percent: number;
}

const PERCENT_SUM_TOLERANCE = 0.01;

export function distributeQuantityByPercent(percentages: SizePercent[], totalQuantity: number): SizeQuantity[] {
  if (percentages.length === 0) {
    throw new DomainError("Нет ни одного размера для распределения по процентам", "SIZE_DISTRIBUTION_EMPTY");
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
    throw new DomainError(
      `Общее количество должно быть положительным целым числом (получено ${totalQuantity})`,
      "SIZE_DISTRIBUTION_QUANTITY_INVALID",
    );
  }
  for (const row of percentages) {
    if (row.percent < 0) {
      throw new DomainError(
        `Процент размера "${row.size}" не может быть отрицательным (получено ${row.percent})`,
        "SIZE_PERCENT_INVALID",
      );
    }
  }
  const sum = percentages.reduce((total, row) => total + row.percent, 0);
  if (Math.abs(sum - 100) > PERCENT_SUM_TOLERANCE) {
    throw new DomainError(
      `Проценты должны в сумме давать 100% (получено ${sum.toFixed(2)}%)`,
      "SIZE_PERCENT_SUM_INVALID",
    );
  }

  const quantities = distributeByWeights(
    percentages.map((row) => row.percent / 100),
    totalQuantity,
  );
  return percentages.map((row, index) => ({ size: row.size, quantity: quantities[index] ?? 0 }));
}

// Деление количества поровну между N группами (largest remainder) — для
// величин, где нет смысла в тирах "хвост"/"ядро" размерного ряда (например,
// цвета одной модели: владелец проекта, 2026-08-03 — общее количество сперва
// делится между цветами поровну, затем внутри каждого цвета — по размерам,
// см. distributeQuantityBySize).
export function distributeQuantityEvenly(groupCount: number, totalQuantity: number): number[] {
  if (groupCount <= 0) {
    throw new DomainError("Нет ни одной группы для равного распределения количества", "EVEN_DISTRIBUTION_EMPTY");
  }
  if (!Number.isInteger(totalQuantity) || totalQuantity <= 0) {
    throw new DomainError(
      `Общее количество должно быть положительным целым числом (получено ${totalQuantity})`,
      "EVEN_DISTRIBUTION_QUANTITY_INVALID",
    );
  }
  return distributeByWeights(Array<number>(groupCount).fill(1 / groupCount), totalQuantity);
}
