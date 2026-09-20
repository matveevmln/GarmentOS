// Document Template Engine (docs/DOCUMENT_ENGINE_ARCHITECTURE.md, раздел 2 —
// расширено по требованию владельца проекта 2026-07-26: не хардкодный PDF,
// а универсальный шаблон, применимый к любой модели/цеху/компании; меняются
// только данные, структура документа — данные шаблона, не код).
//
// Шаблон описывает СТРУКТУРУ документа (какие поля, в каком порядке, какие
// колонки таблицы) — сами значения подставляются из SpecificationDocumentData
// через {{placeholder}} в текстовых блоках. Разные цеха/компании в будущем
// получают разные SpecificationTemplateDefinition (раздел 6 требования),
// рендерер (infrastructure/pdf-lib-template-renderer.ts) не меняется.

export type SpecificationColumnKey = "index" | "name" | "unit" | "size" | "quantity" | "unitPrice" | "sum";

export interface SpecificationTemplateColumn {
  key: SpecificationColumnKey;
  label: string;
  width: number; // pt, ширины колонок должны укладываться в ширину страницы
  align: "left" | "center" | "right";
  // Выравнивание заголовка колонки — отдельно от выравнивания данных
  // (ПРОМПТ №11.4, владелец проекта, 2026-09-19: pdfplumber-измерение шапки
  // эталона — "Товары"/"Кол-во"/"Цена"/"Сумма" стоят по центру своей
  // колонки, хотя ИХ данные выровнены влево/вправо).
  headerAlign?: "left" | "center" | "right";
  // Выравнивание строки "Итого" — необязательное, по умолчанию берётся из
  // `align`. Эталон (ПРОМПТ №11.4, владелец проекта, 2026-09-19,
  // pdfplumber-измерение): "Кол-во"/"Цена"/"Сумма" в ОБЫЧНЫХ строках стоят
  // по ЦЕНТРУ колонки, но в строке "Итого" количество и сумма выровнены
  // ВЛЕВО — отдельное правило, не совпадающее с `align` обычных строк.
  totalAlign?: "left" | "center" | "right";
}

// Блок подписи — точно повторяет эталон (2026-07-26): заголовок ("Исполнитель:"/
// "Заказчик:") → название стороны → пустое место под подпись/печать (без
// самих печатей/подписей — требование владельца проекта) → должность+ФИО
// подписанта → "М.П.".
export interface SpecificationSignatureBlock {
  headerLine: string;
  companyLine: string;
  nameLines: string[];
  stampLabel: string;
}

export interface SpecificationTemplateDefinition {
  id: string;
  version: number;
  name: string;
  // Каждая строка — с {{placeholder}}, подставляется из
  // SpecificationDocumentData.fields (раздел ниже). Заголовочный блок —
  // 3 центрированные строки (номер+дата спецификации / номер+дата договора /
  // стороны), без отдельного правого блока реквизитов сверху (эталон,
  // фактическая сверка ПРОМПТ №2.2: первая строка — отдельным, более крупным
  // начертанием, вторая и третья — обычным весом).
  titleLines: string[];
  introParagraph: string;
  table: { columns: SpecificationTemplateColumn[] };
  // Строка под таблицей, до пунктов условий (ПРОМПТ №2.2 — обнаружена в
  // эталоне, отсутствовала в шаблоне: "Общая сумма Спецификации №N
  // составляет: X руб.", сумма БЕЗ копеек, в отличие от строки "Итого" в
  // самой таблице).
  totalSumLine: string;
  footerLines: string[];
  signatures: { left: SpecificationSignatureBlock; right: SpecificationSignatureBlock };
}

export interface SpecificationLineItem {
  name: string;
  unit: string;
  size: string;
  quantity: string;
  unitPrice: string;
  sum: string;
}

export interface SpecificationDocumentData {
  fields: Record<string, string>;
  items: SpecificationLineItem[];
  totals: { quantity: string; sum: string };
}

export function applyPlaceholders(text: string, fields: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => fields[key] ?? "");
}

// Эталонный шаблон (docs/DOCUMENT_ENGINE_ARCHITECTURE.md) — структура сверена
// напрямую с оригинальным PDF (ПРОМПТ №2.2, фактическая сверка pypdf/
// pdfplumber: спецификация №7 к договору № П-22-04, ОсОО "Ак-Сарай Текстиль" /
// ИП Гашов А.А., MediaBox 595.28×841.89pt): заголовок в три строки (номер+дата
// спецификации крупнее и жирным, номер+дата договора и стороны — обычным
// весом), вводный пункт "1.", таблица (Товары/Ед.измер./Размер/Кол-во/Цена/
// Сумма) без ТН ВЭД, строка "Итого", отдельная строка "Общая сумма...",
// пункты 2-10 (условия оплаты, период и способ поставки, производитель,
// грузополучатель, возврат брака, экземпляры на русском языке, вступление в
// силу, неотъемлемая часть договора), подписи без печатей (только место под
// подпись).
export const DEFAULT_SPECIFICATION_TEMPLATE: SpecificationTemplateDefinition = {
  id: "default-ru",
  version: 3,
  name: "Спецификация к договору пошива (RU, по умолчанию)",
  // Строка 1 — отдельным, более крупным начертанием в эталоне (11pt, жирная);
  // строки 2-3 — обычным весом (10pt, не жирные) — см. рендерер.
  titleLines: [
    "Спецификация №{{specNumber}} от {{specDate}} г.",
    "к Договору № {{contractNumber}} от {{contractDate}} г.",
    "Между {{contractorName}} и {{customerName}}",
  ],
  introParagraph:
    "1. В соответствии с Договором № {{contractNumber}} от {{contractDate}} г., {{contractorName}} (Далее - Исполнитель) " +
    "поставляет, а {{customerName}} (Далее - Заказчик) оплачивает следующие товары:",
  // Ширины колонок измерены напрямую по вертикальным границам таблицы в
  // оригинале (pdfplumber page.lines, ПРОМПТ №2.2): 28.4/170.1/48.2/51.0/
  // 48.2/51.0/76.5pt, в сумме 473.4pt — ровно ширина содержимого страницы
  // при полях 60.94pt с каждой стороны (595.2756 - 60.94*2).
  // Заголовки "Ед.измер."/"Цена (руб)"/"Сумма (руб)" в эталоне — не перенос
  // по ширине, а буквальный перенос строки внутри ячейки (\n) — так набран
  // оригинал.
  table: {
    columns: [
      { key: "index", label: "№", width: 28.4, align: "center", headerAlign: "center" },
      { key: "name", label: "Товары", width: 170.1, align: "left", headerAlign: "center" },
      { key: "unit", label: "Ед.\nизмер.", width: 48.2, align: "center", headerAlign: "center" },
      { key: "size", label: "Размер", width: 51.0, align: "center", headerAlign: "center" },
      // align: "center" — эталон (ПРОМПТ №11.4, pdfplumber-измерение всех 15
      // строк): "163"/"700,00"/"114 100,00" стоят ровно по центру своей
      // колонки (leftpad≈rightpad с точностью до 0.05pt), не прижаты вправо.
      // totalAlign: "left" — но строка "Итого" измерена отдельно и там
      // количество/сумма выровнены влево (leftpad=2.0pt=CELL_PADDING).
      { key: "quantity", label: "Кол-во", width: 48.2, align: "center", headerAlign: "center", totalAlign: "left" },
      { key: "unitPrice", label: "Цена\n(руб)", width: 51.0, align: "center", headerAlign: "center" },
      { key: "sum", label: "Сумма\n(руб)", width: 76.5, align: "center", headerAlign: "center", totalAlign: "left" },
    ],
  },
  // Сумма БЕЗ копеек и без "(руб)" в скобках — ровно как в оригинале
  // ("Общая сумма Спецификации №7 составляет: 2 800 000 руб."), в отличие от
  // строки "Итого" внутри таблицы (та — с копейками).
  totalSumLine: "Общая сумма Спецификации №{{specNumber}} составляет: {{totalSumNoDecimals}} руб.",
  footerLines: [
    "2. Условия платежа: {{paymentTerms}}",
    "3. Период поставки: до {{deliveryDeadline}} г.",
    "4. Способ доставки товаров: {{deliveryMethod}}.",
    "5. Производитель: {{contractorName}}, {{legalAddress}}.",
    "6. Грузополучатель: {{customerName}}",
    "7. Товар ненадлежащего качества подлежит возврату Исполнителю и повторному пошиву за счёт Исполнителя.",
    "8. Настоящая Спецификация составлена в двух экземплярах для каждой стороны на русском языке, причём оба текста аутентичны.",
    "9. Настоящая Спецификация вступает в силу с момента её подписания.",
    "10. Настоящая Спецификация №{{specNumber}} является неотъемлемой частью Договора № {{contractNumber}} от {{contractDate}} г.",
  ],
  signatures: {
    left: {
      headerLine: "Исполнитель:",
      companyLine: "{{contractorName}}",
      nameLines: ["{{contractorSignerRole}}", "{{contractorSignerName}}"],
      stampLabel: "М.П.",
    },
    right: {
      headerLine: "Заказчик:",
      companyLine: "{{customerName}}",
      nameLines: ["{{customerSignerName}}"],
      stampLabel: "М.П.",
    },
  },
};
