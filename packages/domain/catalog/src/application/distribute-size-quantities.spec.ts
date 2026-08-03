import { describe, expect, it } from "vitest";
import { distributeQuantityBySize } from "./distribute-size-quantities";
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
