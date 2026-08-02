import { describe, expect, it } from "vitest";
import { distributeQuantityAcrossSizes } from "./size-distribution";

describe("distributeQuantityAcrossSizes", () => {
  it("делит поровну, если количество делится без остатка", () => {
    expect(distributeQuantityAcrossSizes(1000, 5)).toEqual([200, 200, 200, 200, 200]);
  });

  it("остаток раздаёт первым размерам по порядку", () => {
    expect(distributeQuantityAcrossSizes(11, 3)).toEqual([4, 4, 3]);
  });

  it("сумма результата всегда равна исходному количеству", () => {
    const result = distributeQuantityAcrossSizes(1234, 7);
    expect(result.reduce((sum, value) => sum + value, 0)).toBe(1234);
  });

  it("нулевое количество распределяется как нули", () => {
    expect(distributeQuantityAcrossSizes(0, 4)).toEqual([0, 0, 0, 0]);
  });

  it("бросает ошибку для нулевого/отрицательного числа размеров", () => {
    expect(() => distributeQuantityAcrossSizes(100, 0)).toThrow();
  });
});
