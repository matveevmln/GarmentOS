import { describe, expect, it } from "vitest";
import { buildParsedProductionRequest, type ExtractedProductionRequestFields } from "./production-request-parser";

describe("buildParsedProductionRequest", () => {
  it("разворачивает цвета × размеры в объёмы по SKU (пример владельца проекта)", () => {
    const fields: ExtractedProductionRequestFields = {
      modelName: "Двойка",
      colors: [
        { colorName: "Петроль", quantity: 1000 },
        { colorName: "Бордо", quantity: 500 },
      ],
      sizes: ["48-50", "52-54", "56-58", "60-62", "64-66"],
      unitPrice: 720,
    };

    const result = buildParsedProductionRequest(fields);

    expect(result.modelName).toBe("Двойка");
    expect(result.unitPrice).toBe(720);
    expect(result.items).toHaveLength(10);
    expect(result.items.filter((item) => item.colorName === "Петроль").map((item) => item.quantity)).toEqual([
      200, 200, 200, 200, 200,
    ]);
    expect(result.items.filter((item) => item.colorName === "Бордо").map((item) => item.quantity)).toEqual([
      100, 100, 100, 100, 100,
    ]);
    const total = result.items.reduce((sum, item) => sum + item.quantity, 0);
    expect(total).toBe(1500);
  });
});
