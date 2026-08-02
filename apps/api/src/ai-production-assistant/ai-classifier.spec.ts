import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicAIClassifier, ProductionRequestParseError, RuleBasedAIClassifier } from "./ai-classifier";

describe("RuleBasedAIClassifier", () => {
  it("разбирает точный пример владельца проекта", async () => {
    const classifier = new RuleBasedAIClassifier();
    const text =
      "Создай спецификацию. Модель: Двойка. Цвета: Петроль — 1000 шт., Бордо — 500 шт. Размеры: 48–50, 52–54, 56–58, 60–62, 64–66. Цена пошива — 720 рублей.";

    const fields = await classifier.extractProductionRequestFields(text);

    expect(fields.modelName).toBe("Двойка");
    expect(fields.workshopName).toBeNull();
    expect(fields.colors).toEqual([
      { colorName: "Петроль", quantity: 1000 },
      { colorName: "Бордо", quantity: 500 },
    ]);
    expect(fields.sizes).toEqual(["48–50", "52–54", "56–58", "60–62", "64–66"]);
    expect(fields.unitPrice).toBe(720);
  });

  it("разбирает необязательное поле «Цех:», если оно указано", async () => {
    const classifier = new RuleBasedAIClassifier();
    const text = "Модель: Двойка. Цех: Ак-Сарай Текстиль. Цвета: Петроль — 100 шт. Размеры: M, L.";

    const fields = await classifier.extractProductionRequestFields(text);

    expect(fields.workshopName).toBe("Ак-Сарай Текстиль");
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

// AnthropicAIClassifier — включается через ANTHROPIC_API_KEY (владелец
// проекта, 2026-08-02: "используй Anthropic Claude API для распознавания
// свободного текстового запроса"), понимает произвольный текст без строгой
// разметки "Модель: ... Цена пошива — ...". fetch подменяется — не требует
// реального сетевого вызова/ключа.
describe("AnthropicAIClassifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("разбирает свободный текст без строгой разметки через ответ Anthropic API", async () => {
    const extracted = {
      modelName: "Двухнитка",
      workshopName: "Ак-Сарай",
      colors: [
        { colorName: "Петроль", quantity: 1000 },
        { colorName: "Бордо", quantity: 500 },
      ],
      sizes: [],
      unitPrice: 900,
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [{ type: "text", text: JSON.stringify(extracted) }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const classifier = new AnthropicAIClassifier("test-api-key");
    const fields = await classifier.extractProductionRequestFields(
      "Отшей двухнитку. Цвет петроль 1000 штук, бордо 500. Цех Ак-Сарай. Цена 900 рублей.",
    );

    expect(fields).toEqual(extracted);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers["x-api-key"]).toBe("test-api-key");
  });

  it("бросает ProductionRequestParseError, если Anthropic API вернул невалидный JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: "не JSON" }] }),
      }),
    );

    const classifier = new AnthropicAIClassifier("test-api-key");
    await expect(classifier.extractProductionRequestFields("любой текст")).rejects.toThrow(ProductionRequestParseError);
  });

  it("бросает ошибку, если Anthropic API вернул не-2xx ответ", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve("internal error") }),
    );

    const classifier = new AnthropicAIClassifier("test-api-key");
    await expect(classifier.extractProductionRequestFields("любой текст")).rejects.toThrow(/Anthropic API вернул 500/);
  });
});
