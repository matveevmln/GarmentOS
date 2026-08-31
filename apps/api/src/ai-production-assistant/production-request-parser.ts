import { distributeQuantityByRatio } from "@garmentos/domain-catalog";

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

// Разворачивает извлечённые поля в объёмы по SKU (цвет × размер): раскладка
// применяется к каждому цвету отдельно от его количества.
//
// sizeWeights — раскладка из карточки модели (владелец проекта, 2026-08-30).
// Один и тот же механизм на всех входах системы: и веб-форма, и разбор
// свободного текста считают через distributeQuantityByRatio. Размер, которого
// нет в раскладке (или раскладка не задана вовсе), получает вес 1 — тогда
// деление становится равномерным, и это единственное запасное поведение, а
// не второе правило.
export function buildParsedProductionRequest(
  fields: ExtractedProductionRequestFields,
  sizeWeights?: Map<string, number>,
): ParsedProductionRequest {
  const items: ParsedProductionRequestItem[] = [];

  for (const color of fields.colors) {
    const perSize = distributeQuantityByRatio(
      fields.sizes.map((size) => ({ size, weight: sizeWeights?.get(size) ?? 1 })),
      color.quantity,
    );
    perSize.forEach((row) => {
      items.push({ colorName: color.colorName, size: row.size, quantity: row.quantity });
    });
  }

  return { modelName: fields.modelName, workshopName: fields.workshopName, unitPrice: fields.unitPrice, items };
}
