import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicAIClassifier, ProductionRequestParseError, RuleBasedAIClassifier, type AIClassifier } from "./ai-classifier";

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

// RuleBasedAIClassifier.extractDocumentFields — намеренно нет детерминированного
// парсера инвойсов/пакинг-листов (реальные документы поставщиков слишком
// разные для надёжного регэкспа): честная ошибка вместо угадывания.
describe("RuleBasedAIClassifier.extractDocumentFields", () => {
  it("бросает ProductionRequestParseError вместо того, чтобы притворяться, что разбор работает", async () => {
    const classifier: AIClassifier = new RuleBasedAIClassifier();

    await expect(classifier.extractDocumentFields("invoice", "любой текст инвойса")).rejects.toThrow(
      ProductionRequestParseError,
    );
  });
});

// AnthropicAIClassifier.extractDocumentFields (P6, Document Intelligence) —
// реальный пример владельца проекта: инвойс RB-260628 (3 позиции ткани) и
// пакинг-лист к нему. fetch подменяется — без реального сетевого вызова/ключа.
describe("AnthropicAIClassifier.extractDocumentFields", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubAnthropicResponse(payload: unknown): void {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: [{ type: "text", text: JSON.stringify(payload) }] }),
      }),
    );
  }

  it("извлекает инвойс из текста: числа, валюта и построчные суммы", async () => {
    const invoicePayload = {
      documentType: "invoice",
      supplierName: "ABC Textile",
      documentNumber: "RB-260628",
      documentDate: "2026-06-28",
      currency: "USD",
      totalAmount: 27856.98,
      totalPackages: null,
      totalNetWeight: null,
      totalGrossWeight: null,
      totalCbm: null,
      lines: [
        {
          description: "стеганое полотно",
          materialCode: null,
          color: null,
          quantity: 4843.7,
          unit: "kg",
          unitPrice: 4.1,
          lineTotal: 19859.17,
          packageCount: null,
          packageUnit: null,
          netWeight: null,
          grossWeight: null,
          cbm: null,
        },
        {
          description: "подклад",
          materialCode: null,
          color: null,
          quantity: 4624.4,
          unit: "m",
          unitPrice: 0.75,
          lineTotal: 3468.3,
          packageCount: null,
          packageUnit: null,
          netWeight: null,
          grossWeight: null,
          cbm: null,
        },
      ],
    };
    stubAnthropicResponse(invoicePayload);

    const classifier = new AnthropicAIClassifier("test-api-key");
    const fields = await classifier.extractDocumentFields(
      "invoice",
      "Invoice RB-260628 от 28.06.2026. Стеганое полотно 4843.70 kg x $4.10 = $19,859.17. Подклад 4624.40 m x $0.75 = $3,468.30. Итого: $27,856.98.",
    );

    expect(fields.documentType).toBe("invoice");
    expect(fields.currency).toBe("USD");
    expect(fields.totalAmount).toBe(27856.98);
    expect(fields.lines).toHaveLength(2);
    expect(fields.lines[0]).toMatchObject({ quantity: 4843.7, unit: "kg", unitPrice: 4.1, lineTotal: 19859.17 });
    expect(typeof fields.lines[0]?.quantity).toBe("number");
  });

  it("извлекает пакинг-лист: места/вес отдельно от полей инвойса, без конвертации единиц", async () => {
    const packingListPayload = {
      documentType: "packing_list",
      supplierName: "ABC Textile",
      documentNumber: "RB-260628",
      documentDate: "2026-06-28",
      currency: null,
      totalAmount: null,
      totalPackages: 251,
      totalNetWeight: 5709.3,
      totalGrossWeight: 5780.8,
      totalCbm: 42,
      lines: [
        {
          description: "подклад",
          materialCode: null,
          color: null,
          quantity: null,
          unit: null,
          unitPrice: null,
          lineTotal: null,
          packageCount: 18,
          packageUnit: "bales",
          netWeight: 363.7,
          grossWeight: 367.3,
          cbm: 0,
        },
      ],
    };
    stubAnthropicResponse(packingListPayload);

    const classifier = new AnthropicAIClassifier("test-api-key");
    // Тот же груз, что и в инвойсе выше: инвойс называет подклад "4624.40 m",
    // пакинг-лист — "363.70 kg NW" одного и того же места. Это два разных
    // факта из двух документов, не одна величина в разных единицах.
    const fields = await classifier.extractDocumentFields(
      "packing_list",
      "Packing List RB-260628. Подклад: 18 bales, NW 363.70 kg, GW 367.30 kg.",
    );

    expect(fields.documentType).toBe("packing_list");
    expect(fields.lines[0]?.netWeight).toBe(363.7);
    expect(fields.lines[0]?.packageCount).toBe(18);
    // Поля инвойса не подставляются и не пересчитываются из веса пакинг-листа.
    expect(fields.lines[0]?.quantity).toBeNull();
    expect(fields.lines[0]?.unit).toBeNull();
  });

  it("отсутствующие в тексте поля остаются null, а не придумываются", async () => {
    stubAnthropicResponse({
      documentType: "invoice",
      supplierName: null,
      documentNumber: null,
      documentDate: null,
      currency: null,
      totalAmount: null,
      totalPackages: null,
      totalNetWeight: null,
      totalGrossWeight: null,
      totalCbm: null,
      lines: [
        {
          description: "плащевка",
          materialCode: null,
          color: null,
          quantity: 4767.9,
          unit: "m",
          unitPrice: null,
          lineTotal: null,
          packageCount: null,
          packageUnit: null,
          netWeight: null,
          grossWeight: null,
          cbm: null,
        },
      ],
    });

    const classifier = new AnthropicAIClassifier("test-api-key");
    const fields = await classifier.extractDocumentFields("invoice", "Плащевка 4767.90 m, цена не указана");

    expect(fields.supplierName).toBeNull();
    expect(fields.totalAmount).toBeNull();
    expect(fields.lines[0]?.unitPrice).toBeNull();
    expect(fields.lines[0]?.lineTotal).toBeNull();
  });

  it("documentType всегда берётся из переданного вызывающим значения, а не из ответа AI", async () => {
    stubAnthropicResponse({
      documentType: "packing_list", // AI "ошибся" — вызывающий явно передал invoice
      supplierName: null,
      documentNumber: null,
      documentDate: null,
      currency: null,
      totalAmount: null,
      totalPackages: null,
      totalNetWeight: null,
      totalGrossWeight: null,
      totalCbm: null,
      lines: [],
    });

    const classifier = new AnthropicAIClassifier("test-api-key");
    const fields = await classifier.extractDocumentFields("invoice", "любой текст");

    expect(fields.documentType).toBe("invoice");
  });
});
