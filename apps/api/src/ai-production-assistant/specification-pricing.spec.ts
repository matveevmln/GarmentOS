import { describe, expect, it } from "vitest";
import { computeSpecificationLinePricing } from "./specification-pricing";

describe("computeSpecificationLinePricing", () => {
  it("обычный заказ без rework считает по цене заказа — как и раньше", () => {
    const order = { agreedUnitPrice: "450" };
    const result = computeSpecificationLinePricing(order, { variantType: "new", unitPrice: null, quantity: "100" });
    expect(result).toEqual({ quantity: 100, unitPrice: 450, sum: 45000 });
  });

  it("rework-строка всегда бесплатна, даже если бы в unitPrice случайно оказалось не 0", () => {
    const order = { agreedUnitPrice: "500" };
    const result = computeSpecificationLinePricing(order, { variantType: "rework", unitPrice: "0", quantity: "4" });
    expect(result).toEqual({ quantity: 4, unitPrice: 0, sum: 0 });
  });

  it("смешанный заказ: сумма считается по строкам, а не единой agreedUnitPrice × plannedQuantity", () => {
    // Пример из задания: 4 REWORK + 3 REWORK + 20 NEW × 500 + 10 NEW × 500 = 15 000.
    const order = { agreedUnitPrice: "500" };
    const lines = [
      { variantType: "rework" as const, unitPrice: "0", quantity: "4" },
      { variantType: "rework" as const, unitPrice: "0", quantity: "3" },
      { variantType: "new" as const, unitPrice: null, quantity: "20" },
      { variantType: "new" as const, unitPrice: null, quantity: "10" },
    ];
    const totalSum = lines.reduce((sum, line) => sum + computeSpecificationLinePricing(order, line).sum, 0);
    const totalQuantity = lines.reduce((sum, line) => sum + computeSpecificationLinePricing(order, line).quantity, 0);
    expect(totalSum).toBe(15000);
    expect(totalQuantity).toBe(37);

    // Старая формула (agreedUnitPrice × plannedQuantity) дала бы неверные 18 500 —
    // именно расхождение, которое обязан устранить P5-2.
    expect(Number(order.agreedUnitPrice) * totalQuantity).toBe(18500);
    expect(Number(order.agreedUnitPrice) * totalQuantity).not.toBe(totalSum);
  });

  it("new-строка со своей ценой (переопределение) считается по ней, а не по цене заказа", () => {
    const order = { agreedUnitPrice: "500" };
    const result = computeSpecificationLinePricing(order, { variantType: "new", unitPrice: "480", quantity: "10" });
    expect(result).toEqual({ quantity: 10, unitPrice: 480, sum: 4800 });
  });
});
