import { describe, expect, it } from "vitest";
import { distributeQuantityByRatio, distributeQuantityBySize, type SizeRatio } from "./distribute-size-quantities";
import { DomainError } from "../domain/errors";

describe("distributeQuantityBySize", () => {
  it("делит 5-размерный ряд по правилу 60% на средние / 40% на крайние (пример владельца проекта)", () => {
    // 48-50, 52-54, 56-58, 60-62, 64-66 — три средних размера получают 60%
    // (по 20% каждый), два крайних делят 40% (по 20% каждый) — в этом
    // конкретном случае с тремя средними размерами доли совпадают (по 20%
    // на каждый из 5 размеров), поэтому 3000 делится поровну.
    const result = distributeQuantityBySize(["48-50", "52-54", "56-58", "60-62", "64-66"], 3000);
    expect(result).toEqual([
      { size: "48-50", quantity: 600 },
      { size: "52-54", quantity: 600 },
      { size: "56-58", quantity: 600 },
      { size: "60-62", quantity: 600 },
      { size: "64-66", quantity: 600 },
    ]);
    expect(result.reduce((sum, row) => sum + row.quantity, 0)).toBe(3000);
  });

  it("даёт средним размерам больше веса, чем крайним, при неравном числе средних размеров", () => {
    // Один средний размер (M) получает все 60%, S и L делят 40% (по 20%).
    const result = distributeQuantityBySize(["S", "M", "L"], 100);
    expect(result).toEqual([
      { size: "S", quantity: 20 },
      { size: "M", quantity: 60 },
      { size: "L", quantity: 20 },
    ]);
  });

  it("делит 1-2 размера поровну — тиры не применяются", () => {
    expect(distributeQuantityBySize(["ONE_SIZE"], 500)).toEqual([{ size: "ONE_SIZE", quantity: 500 }]);
    expect(distributeQuantityBySize(["S", "L"], 101)).toEqual([
      { size: "S", quantity: 51 },
      { size: "L", quantity: 50 },
    ]);
  });

  it("сумма количеств всегда точно равна общему количеству (largest remainder), даже при неделящихся остатках", () => {
    const result = distributeQuantityBySize(["XS", "S", "M", "L", "XL", "XXL"], 1000);
    expect(result.reduce((sum, row) => sum + row.quantity, 0)).toBe(1000);
  });

  it("отклоняет пустой размерный ряд и нецелое/неположительное количество", () => {
    expect(() => distributeQuantityBySize([], 100)).toThrow(DomainError);
    expect(() => distributeQuantityBySize(["S"], 0)).toThrow(DomainError);
    expect(() => distributeQuantityBySize(["S"], -5)).toThrow(DomainError);
    expect(() => distributeQuantityBySize(["S"], 10.5)).toThrow(DomainError);
  });
});

describe("distributeQuantityByRatio (раскладка из карточки модели)", () => {
  // Реальный размерный ряд «Стеганки» (владелец проекта, 2026-08-30).
  const STEGANKA: SizeRatio[] = [
    { size: "48-50", weight: 185 },
    { size: "52-54", weight: 381 },
    { size: "56-58", weight: 381 },
    { size: "60-62", weight: 381 },
    { size: "64-66", weight: 186 },
  ];

  it("на количестве, равном сумме весов, возвращает сами веса", () => {
    expect(distributeQuantityByRatio(STEGANKA, 1514).map((row) => row.quantity)).toEqual([
      185, 381, 381, 381, 186,
    ]);
  });

  it("масштабирует раскладку на другой объём (пример владельца: 500 → 61/126/126/126/61)", () => {
    expect(distributeQuantityByRatio(STEGANKA, 500).map((row) => row.quantity)).toEqual([
      61, 126, 126, 126, 61,
    ]);
  });

  it("«Двухнитка»: 300 и 200 по одной и той же раскладке дают ровно 300 и 200", () => {
    const dvuhnitka: SizeRatio[] = [
      { size: "48-50", weight: 185 },
      { size: "52-54", weight: 381 },
      { size: "56-58", weight: 381 },
      { size: "60-62", weight: 381 },
      { size: "64-66", weight: 186 },
    ];
    const petrol = distributeQuantityByRatio(dvuhnitka, 300);
    const bordo = distributeQuantityByRatio(dvuhnitka, 200);
    expect(petrol.reduce((sum, row) => sum + row.quantity, 0)).toBe(300);
    expect(bordo.reduce((sum, row) => sum + row.quantity, 0)).toBe(200);
  });

  it("не теряет и не добавляет ни одной единицы на любом объёме", () => {
    for (const total of [1, 7, 99, 1000, 4542, 12345]) {
      const result = distributeQuantityByRatio(STEGANKA, total);
      expect(result.reduce((sum, row) => sum + row.quantity, 0), `объём ${total}`).toBe(total);
    }
  });

  it("детерминирована: один и тот же вход всегда даёт один и тот же выход", () => {
    const first = distributeQuantityByRatio(STEGANKA, 777);
    for (let i = 0; i < 20; i += 1) {
      expect(distributeQuantityByRatio(STEGANKA, 777)).toEqual(first);
    }
  });

  it("при равных весах ведёт себя как равномерное деление, остаток — первым размерам", () => {
    const equal: SizeRatio[] = ["S", "M", "L"].map((size) => ({ size, weight: 1 }));
    expect(distributeQuantityByRatio(equal, 11).map((row) => row.quantity)).toEqual([4, 4, 3]);
  });

  it("отклоняет пустой ряд, неположительный вес и нецелое количество", () => {
    expect(() => distributeQuantityByRatio([], 100)).toThrow(DomainError);
    expect(() => distributeQuantityByRatio([{ size: "S", weight: 0 }], 100)).toThrow(DomainError);
    expect(() => distributeQuantityByRatio([{ size: "S", weight: -1 }], 100)).toThrow(DomainError);
    expect(() => distributeQuantityByRatio(STEGANKA, 10.5)).toThrow(DomainError);
  });
});
