import { Logger } from "@nestjs/common";
import type { DocumentIntelligenceType, ExtractedDocumentFields } from "./document-extraction-types";
import type { ExtractedProductionRequestFields } from "./production-request-parser";

// Ошибка в форме, которую распознаёт DomainExceptionFilter (duck typing по
// {message, code}, см. apps/api/src/common/domain-exception.filter.ts) — без
// суффиксов из статических списков там код мапится на 400 Bad Request, что и
// нужно для "не смог разобрать запрос".
export class ProductionRequestParseError extends Error {
  readonly code = "PRODUCTION_REQUEST_UNPARSEABLE";

  constructor(message: string) {
    super(message);
    this.name = "ProductionRequestParseError";
  }
}

// AIClassifier — тот же паттерн адаптера, что MarketplaceConnector/
// TelegramClient: доменный/прикладной код зависит только от интерфейса,
// конкретная реализация подключается через DI (ai-production-assistant.module.ts).
export interface AIClassifier {
  extractProductionRequestFields(text: string): Promise<ExtractedProductionRequestFields>;
  // P6 (Document Intelligence, владелец проекта, 2026-09-06) — извлечение
  // структурированных данных инвойса/пакинг-листа из текста. Тот же
  // интерфейс/паттерн адаптера, что и extractProductionRequestFields выше —
  // второй метод на том же классификаторе, не второй AI-клиент.
  extractDocumentFields(documentType: DocumentIntelligenceType, text: string): Promise<ExtractedDocumentFields>;
}

interface LabelMatch {
  key: "modelName" | "workshopName" | "colors" | "sizes" | "unitPrice";
  start: number;
  contentStart: number;
}

const LABEL_PATTERNS: Array<{ key: LabelMatch["key"]; pattern: RegExp }> = [
  { key: "modelName", pattern: /модель\s*:/iu },
  { key: "workshopName", pattern: /цех\s*:/iu },
  { key: "colors", pattern: /цвета\s*:/iu },
  { key: "sizes", pattern: /размеры\s*:/iu },
  { key: "unitPrice", pattern: /цена\s+пошива\s*[:—-]*/iu },
];

function findLabelMatches(text: string): LabelMatch[] {
  const matches: LabelMatch[] = [];
  for (const { key, pattern } of LABEL_PATTERNS) {
    const match = pattern.exec(text);
    if (match) matches.push({ key, start: match.index, contentStart: match.index + match[0].length });
  }
  return matches.sort((a, b) => a.start - b.start);
}

function extractSegments(text: string): Partial<Record<LabelMatch["key"], string>> {
  const matches = findLabelMatches(text);
  const segments: Partial<Record<LabelMatch["key"], string>> = {};

  matches.forEach((match, index) => {
    const end = matches[index + 1]?.start ?? text.length;
    segments[match.key] = text
      .slice(match.contentStart, end)
      .trim()
      .replace(/[.\s]+$/u, "");
  });

  return segments;
}

function parseColors(segment: string): ExtractedProductionRequestFields["colors"] {
  return segment.split(",").map((part) => {
    const match = /([^—-]+?)\s*[—-]\s*(\d+)/u.exec(part.trim());
    if (!match?.[1] || !match[2]) {
      throw new ProductionRequestParseError(`Не удалось разобрать цвет/количество: "${part.trim()}"`);
    }
    return { colorName: match[1].trim(), quantity: Number.parseInt(match[2], 10) };
  });
}

function parseSizes(segment: string): string[] {
  return segment
    .split(",")
    .map((size) => size.trim())
    .filter((size) => size.length > 0);
}

function parseUnitPrice(segment: string | undefined): number | null {
  if (!segment) return null;
  const match = /(\d+(?:[.,]\d+)?)/u.exec(segment);
  if (!match?.[1]) return null;
  return Number.parseFloat(match[1].replace(",", "."));
}

// Детерминированный fallback, работающий без ANTHROPIC_API_KEY (тот же
// принцип, что LoggingTelegramClient) — распознаёт только строгий
// размеченный формат ("Модель: ... Цвета: ИмяЦвета — Количество шт., ...
// Размеры: ..., ... Цена пошива — Число рублей."), а не произвольный
// свободный текст. Настоящее распознавание свободной речи — задача
// AnthropicAIClassifier (требует ANTHROPIC_API_KEY, docs/TECH_STACK.md).
export class RuleBasedAIClassifier implements AIClassifier {
  // eslint-disable-next-line @typescript-eslint/require-await -- throws синхронно, но интерфейс требует Promise (см. AnthropicAIClassifier) — async оборачивает throw в отклонённый промис для вызывающего кода.
  async extractProductionRequestFields(text: string): Promise<ExtractedProductionRequestFields> {
    const segments = extractSegments(text);

    if (!segments.modelName) {
      throw new ProductionRequestParseError(
        'Не найдено поле "Модель:" — RuleBasedAIClassifier понимает только строгий размеченный формат (см. комментарий в исходнике), для свободного текста настройте ANTHROPIC_API_KEY',
      );
    }
    if (!segments.colors) {
      throw new ProductionRequestParseError('Не найдено поле "Цвета:"');
    }
    if (!segments.sizes) {
      throw new ProductionRequestParseError('Не найдено поле "Размеры:"');
    }

    const modelName = segments.modelName.replace(/^['"«]+|['"»]+$/gu, "").trim();
    const workshopName = segments.workshopName?.replace(/^['"«]+|['"»]+$/gu, "").trim() ?? null;
    const colors = parseColors(segments.colors);
    const sizes = parseSizes(segments.sizes);
    const unitPrice = parseUnitPrice(segments.unitPrice);

    return { modelName, workshopName, colors, sizes, unitPrice };
  }

  // В отличие от extractProductionRequestFields выше, у инвойсов/пакинг-листов
  // нет собственного строгого размеченного формата, который можно было бы
  // разобрать надёжным регэкспом (структура реальных документов поставщиков
  // слишком разная) — придумывать такой парсер означало бы делать вид, что
  // распознавание работает, когда на самом деле это не так. Честная ошибка
  // вместо угадывания, тем же способом, что и выше — ProductionRequestParseError,
  // тот же duck-typed {message, code} для DomainExceptionFilter.
  // eslint-disable-next-line @typescript-eslint/require-await -- throws синхронно, но интерфейс требует Promise, как и extractProductionRequestFields выше.
  async extractDocumentFields(): Promise<ExtractedDocumentFields> {
    throw new ProductionRequestParseError(
      "Извлечение данных инвойса/пакинг-листа без строгой разметки требует настроенного ANTHROPIC_API_KEY",
    );
  }
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `Ты извлекаешь структурированные данные производственного запроса на пошив одежды из свободного текста на русском языке.
Верни ТОЛЬКО валидный JSON (без markdown-разметки, без пояснений) следующей формы:
{"modelName": string, "workshopName": string | null, "colors": [{"colorName": string, "quantity": number}], "sizes": [string], "unitPrice": number | null}
Если размеры не указаны — верни пустой массив sizes. Если цена не указана — верни null. Если цех явно не назван — верни null для workshopName. Не придумывай данные, которых нет в тексте.`;

// P6 (Document Intelligence) — извлечение инвойса/пакинг-листа. Одна форма
// JSON на оба типа документа (см. document-extraction-types.ts — почему один
// тип строки на оба вида документа), явно требует не путать поля инвойса
// (quantity/unit/unitPrice/lineTotal) и пакинг-листа (packageCount/
// packageUnit/netWeight/grossWeight/cbm) и никогда не пересчитывать одно в
// другое — это ключевое ограничение P6 (документы называют один и тот же
// груз разными числами в разных единицах, это два факта, не один).
const DOCUMENT_SYSTEM_PROMPT = `Ты извлекаешь структурированные данные из инвойса или пакинг-листа поставщика ткани/фурнитуры на русском или английском языке.
Верни ТОЛЬКО валидный JSON (без markdown-разметки, без пояснений) следующей формы:
{
  "documentType": "invoice" | "packing_list",
  "supplierName": string | null,
  "documentNumber": string | null,
  "documentDate": string | null,
  "currency": string | null,
  "totalAmount": number | null,
  "totalPackages": number | null,
  "totalNetWeight": number | null,
  "totalGrossWeight": number | null,
  "totalCbm": number | null,
  "lines": [
    {
      "description": string,
      "materialCode": string | null,
      "color": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "lineTotal": number | null,
      "packageCount": number | null,
      "packageUnit": string | null,
      "netWeight": number | null,
      "grossWeight": number | null,
      "cbm": number | null
    }
  ]
}
Правила:
1. Заполняй только те поля, для которых в тексте прямо есть значение. Если значения нет — верни null, никогда не выдумывай и не оценивай его.
2. "quantity"/"unit"/"unitPrice"/"lineTotal" — это поля ИНВОЙСА (сколько купили и почём). "packageCount"/"packageUnit"/"netWeight"/"grossWeight"/"cbm" — это поля ПАКИНГ-ЛИСТА (сколько мест и какой вес). Заполняй только те, что реально присутствуют для этого документа — не переноси число из одного набора полей в другой.
3. НИКОГДА не переводи одну единицу измерения в другую (например, метры в килограммы) и не пересчитывай план по факту или наоборот — оставляй именно то число и единицу, которые написаны в тексте.
4. documentType укажи по смыслу текста (счёт/инвойс = "invoice", упаковочный/пакинг-лист = "packing_list").`;

interface AnthropicMessageResponse {
  content: Array<{ type: string; text?: string }>;
}

// Реальный адаптер (docs/TECH_STACK.md, раздел LLM) — включается через
// DI-фабрику (ai-production-assistant.module.ts) только когда задан
// ANTHROPIC_API_KEY.
export class AnthropicAIClassifier implements AIClassifier {
  private readonly logger = new Logger(AnthropicAIClassifier.name);

  constructor(private readonly apiKey: string) {}

  async extractProductionRequestFields(text: string): Promise<ExtractedProductionRequestFields> {
    const textBlock = await this.callAnthropic(SYSTEM_PROMPT, text);
    try {
      return JSON.parse(textBlock) as ExtractedProductionRequestFields;
    } catch {
      this.logger.error(`Не удалось разобрать JSON от Anthropic: ${textBlock}`);
      throw new ProductionRequestParseError("AI-классификатор вернул невалидный JSON");
    }
  }

  async extractDocumentFields(documentType: DocumentIntelligenceType, text: string): Promise<ExtractedDocumentFields> {
    const textBlock = await this.callAnthropic(DOCUMENT_SYSTEM_PROMPT, text);
    try {
      const parsed = JSON.parse(textBlock) as ExtractedDocumentFields;
      // documentType задаётся вызывающим (оператор явно выбрал тип документа
      // перед извлечением) — не полагаемся на то, что AI угадает его так же.
      return { ...parsed, documentType };
    } catch {
      this.logger.error(`Не удалось разобрать JSON от Anthropic: ${textBlock}`);
      throw new ProductionRequestParseError("AI-классификатор вернул невалидный JSON");
    }
  }

  private async callAnthropic(systemPrompt: string, userText: string): Promise<string> {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content: userText }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API вернул ${response.status}: ${body}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    const textBlock = data.content.find((block) => block.type === "text")?.text;
    if (!textBlock) throw new Error("Anthropic API не вернул текстовый блок с JSON");
    return textBlock;
  }
}
