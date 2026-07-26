import { Logger } from "@nestjs/common";
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
}

interface LabelMatch {
  key: "modelName" | "colors" | "sizes" | "unitPrice";
  start: number;
  contentStart: number;
}

const LABEL_PATTERNS: Array<{ key: LabelMatch["key"]; pattern: RegExp }> = [
  { key: "modelName", pattern: /модель\s*:/iu },
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
    const colors = parseColors(segments.colors);
    const sizes = parseSizes(segments.sizes);
    const unitPrice = parseUnitPrice(segments.unitPrice);

    return { modelName, colors, sizes, unitPrice };
  }
}

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `Ты извлекаешь структурированные данные производственного запроса на пошив одежды из свободного текста на русском языке.
Верни ТОЛЬКО валидный JSON (без markdown-разметки, без пояснений) следующей формы:
{"modelName": string, "colors": [{"colorName": string, "quantity": number}], "sizes": [string], "unitPrice": number | null}
Если размеры не указаны — верни пустой массив sizes. Если цена не указана — верни null. Не придумывай данные, которых нет в тексте.`;

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
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API вернул ${response.status}: ${body}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    const textBlock = data.content.find((block) => block.type === "text")?.text;
    if (!textBlock) throw new Error("Anthropic API не вернул текстовый блок с JSON");

    try {
      return JSON.parse(textBlock) as ExtractedProductionRequestFields;
    } catch {
      this.logger.error(`Не удалось разобрать JSON от Anthropic: ${textBlock}`);
      throw new ProductionRequestParseError("AI-классификатор вернул невалидный JSON");
    }
  }
}
