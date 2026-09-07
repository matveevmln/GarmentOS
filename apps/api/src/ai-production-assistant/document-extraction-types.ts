// Типы извлечения данных из инвойса/пакинг-листа (P6, Document Intelligence,
// владелец проекта, 2026-09-06). Один и тот же тип строки для обоих видов
// документа — сознательно: инвойс и пакинг-лист описывают одни и те же
// материалы разными полями (цена vs количество мест/вес), заводить две
// параллельные иерархии типов ради этого не нужно (см. аудит документов —
// "не создавать generic-фреймворк без необходимости"). Отсутствующее поле —
// null, а не 0 и не выдуманное значение: AI не имеет права придумывать
// данные, которых нет в тексте.

export type DocumentIntelligenceType = "invoice" | "packing_list";

export interface ExtractedDocumentLine {
  /** Как материал назван в самом документе — то, что реально написано. */
  description: string;
  /** Артикул/код поставщика, если указан (например, "RB-260628-2"). */
  materialCode: string | null;
  color: string | null;

  // Инвойс — количество/цена.
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;

  // Пакинг-лист — места и вес. Единицы НЕ конвертируются ни в quantity/unit
  // выше, ни друг в друга (кг остаётся кг, м остаётся м) — см. документацию
  // ExtractedDocumentFields ниже.
  packageCount: number | null;
  packageUnit: string | null;
  netWeight: number | null;
  grossWeight: number | null;
  cbm: number | null;
}

// Инвойс и пакинг-лист на один и тот же груз почти всегда называют одну и ту
// же позицию разными числами в разных единицах (инвойс — метры ткани,
// пакинг-лист — вес места в кг) — это два независимых факта из двух разных
// документов, а не одна и та же величина, которую можно свести друг к другу.
// Хранить их в одном объединённом типе строки (см. выше) и НИКОГДА не
// пересчитывать одно через другое — прямое требование задания P6.
export interface ExtractedDocumentFields {
  documentType: DocumentIntelligenceType;
  supplierName: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  currency: string | null;
  /** Итоговая сумма, указанная в самом документе (обычно только у инвойса). */
  totalAmount: number | null;
  /** Итоговое число мест, указанное в документе (обычно только у пакинг-листа). */
  totalPackages: number | null;
  totalNetWeight: number | null;
  totalGrossWeight: number | null;
  totalCbm: number | null;
  lines: ExtractedDocumentLine[];
}
