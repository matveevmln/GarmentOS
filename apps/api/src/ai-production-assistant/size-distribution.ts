// Распределение объёма по размерам (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md,
// раздел 2, пункт 2) — если пользователь не указал разбивку по размерам явно,
// объём делится поровну. Это финансово значимое число, поэтому считается
// детерминированным кодом, а не LLM (AI не придумывает объёмы — только
// извлекает то, что сказал пользователь).
//
// Остаток от деления добавляется первым размерам по порядку — сумма всегда
// равна исходному количеству, ни одна единица не теряется и не добавляется.
export function distributeQuantityAcrossSizes(totalQuantity: number, sizeCount: number): number[] {
  if (sizeCount < 1) throw new Error("sizeCount должен быть не меньше 1");
  if (!Number.isInteger(totalQuantity) || totalQuantity < 0) {
    throw new Error("totalQuantity должен быть неотрицательным целым числом");
  }

  const base = Math.floor(totalQuantity / sizeCount);
  const remainder = totalQuantity - base * sizeCount;

  return Array.from({ length: sizeCount }, (_, index) => base + (index < remainder ? 1 : 0));
}
