import { distributeQuantityAcrossSizes } from "./size-distribution";

// Поля, извлекаемые AIClassifier'ом из текста/голоса производственного
// запроса (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md, раздел 2) —
// сырое извлечение сущностей, без арифметики (см. комментарий в
// size-distribution.ts).
export interface ExtractedProductionRequestColor {
  colorName: string;
  quantity: number;
}

export interface ExtractedProductionRequestFields {
  modelName: string;
  // Цех — необязательное поле: в большинстве сообщений не называется явно
  // (пользователь пишет только что шить, не куда) — резолвится отдельно
  // (единственный активный цех компании, либо явное совпадение с этим
  // именем), см. ProductionOrderOrchestrationService.
  workshopName: string | null;
  colors: ExtractedProductionRequestColor[];
  sizes: string[];
  unitPrice: number | null;
}

export interface ParsedProductionRequestItem {
  colorName: string;
  size: string;
  quantity: number;
}

export interface ParsedProductionRequest {
  modelName: string;
  workshopName: string | null;
  unitPrice: number | null;
  items: ParsedProductionRequestItem[];
}

// Разворачивает извлечённые поля в объёмы по SKU (цвет × размер) — размерная
// сетка применяется к каждому цвету одинаково, реальное распределение по
// конкретным SKU каталога — задача Итерации 7 (пункт (2) сценария), не этого
// шага.
export function buildParsedProductionRequest(fields: ExtractedProductionRequestFields): ParsedProductionRequest {
  const items: ParsedProductionRequestItem[] = [];

  for (const color of fields.colors) {
    const perSize = distributeQuantityAcrossSizes(color.quantity, fields.sizes.length);
    fields.sizes.forEach((size, index) => {
      items.push({ colorName: color.colorName, size, quantity: perSize[index] ?? 0 });
    });
  }

  return { modelName: fields.modelName, workshopName: fields.workshopName, unitPrice: fields.unitPrice, items };
}
