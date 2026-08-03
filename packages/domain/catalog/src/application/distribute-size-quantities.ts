import { DomainError } from "../domain/errors";

export interface SizeQuantity {
  size: string;
  quantity: number;
}

// Автоматическое распределение общего количества изделий по размерному ряду
// (владелец проекта, 2026-08-03 — «я указываю только общее количество,
// размерный ряд система распределяет автоматически»). По умолчанию: средние
// размеры получают суммарно 60% объёма, крайние (первый и последний в ряду)
// делят между собой оставшиеся 40% — предполагается, что `sizes` уже
// упорядочен от меньшего к большему (вызывающий код отвечает за порядок,
// здесь порядок не выводится из строк — "S"/"M"/"L" не сортируются
// алфавитно корректно). Это фиксированное правило по умолчанию — владелец
// проекта explicitly указал, что алгоритм должен стать настраиваемым в
// будущем (docs/PRODUCT_MODEL_ARCHITECTURE.md); отдельная таблица под
// конфигурацию пока не создаётся (principles.md №3 — не строить заранее).
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

  const remainders = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }));
  remainders.sort((a, b) => b.fraction - a.fraction);

  const quantities = [...base];
  for (const { index } of remainders) {
    if (remainder <= 0) break;
    quantities[index] = (quantities[index] ?? 0) + 1;
    remainder--;
  }
  return quantities;
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
