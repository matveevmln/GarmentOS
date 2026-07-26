import { describe, expect, it } from "vitest";
import { ProductionRequestParseError, RuleBasedAIClassifier } from "./ai-classifier";

describe("RuleBasedAIClassifier", () => {
  it("разбирает точный пример владельца проекта", async () => {
    const classifier = new RuleBasedAIClassifier();
    const text =
      "Создай спецификацию. Модель: Двойка. Цвета: Петроль — 1000 шт., Бордо — 500 шт. Размеры: 48–50, 52–54, 56–58, 60–62, 64–66. Цена пошива — 720 рублей.";

    const fields = await classifier.extractProductionRequestFields(text);

    expect(fields.modelName).toBe("Двойка");
    expect(fields.colors).toEqual([
      { colorName: "Петроль", quantity: 1000 },
      { colorName: "Бордо", quantity: 500 },
    ]);
    expect(fields.sizes).toEqual(["48–50", "52–54", "56–58", "60–62", "64–66"]);
    expect(fields.unitPrice).toBe(720);
  });

  it("разбирает модель в кавычках и один цвет", async () => {
    const classifier = new RuleBasedAIClassifier();
    const text = "Модель: 'Муслин'. Цвета: Молочный — 300 шт. Размеры: S, M, L.";

    const fields = await classifier.extractProductionRequestFields(text);

    expect(fields.modelName).toBe("Муслин");
    expect(fields.colors).toEqual([{ colorName: "Молочный", quantity: 300 }]);
    expect(fields.sizes).toEqual(["S", "M", "L"]);
    expect(fields.unitPrice).toBeNull();
  });

  it("бросает ProductionRequestParseError при отсутствии обязательного поля", async () => {
    const classifier = new RuleBasedAIClassifier();
    await expect(classifier.extractProductionRequestFields("Просто текст без разметки")).rejects.toThrow(
      ProductionRequestParseError,
    );
  });
});
