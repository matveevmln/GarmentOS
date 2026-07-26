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

export type SpecificationColumnKey = "index" | "name" | "unit" | "size" | "tnVed" | "quantity" | "unitPrice" | "sum";

export interface SpecificationTemplateColumn {
  key: SpecificationColumnKey;
  label: string;
  width: number; // pt, ширины колонок должны укладываться в ширину страницы
  align: "left" | "center" | "right";
}

export interface SpecificationSignatureBlock {
  roleLine: string; // например "Исполнитель:" — статический текст, не шаблонизируется
  nameLine: string; // например "{{contractorSignerRole}}\n{{contractorSignerName}}"
}

export interface SpecificationTemplateDefinition {
  id: string;
  version: number;
  name: string;
  // Каждая строка — с {{placeholder}}, подставляется из
  // SpecificationDocumentData.fields (raздел ниже).
  headerLines: string[];
  title: string;
  introParagraph: string;
  table: { columns: SpecificationTemplateColumn[] };
  footerLines: string[];
  signatures: { left: SpecificationSignatureBlock; right: SpecificationSignatureBlock };
}

export interface SpecificationLineItem {
  name: string;
  unit: string;
  size: string;
  tnVed: string;
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

// Эталонный шаблон (docs/DOCUMENT_ENGINE_ARCHITECTURE.md) — структура точно
// повторяет образец, присланный владельцем проекта: приложение к договору,
// номер/дата спецификации, стороны, таблица (Товары/Ед.измер./Размер/ТН
// ВЭД/Кол-во/Цена/Сумма) с итоговой строкой, условия оплаты и допустимое
// отклонение, срок поставки, реквизиты производителя/грузополучателя,
// подписи без печатей (места под подпись остаются пустыми — раздел 4
// требования: "без печатей, без подписей, места под подписи оставить").
export const DEFAULT_SPECIFICATION_TEMPLATE: SpecificationTemplateDefinition = {
  id: "default-ru",
  version: 1,
  name: "Спецификация к договору пошива (RU, по умолчанию)",
  headerLines: [
    "Приложение к договору № {{contractNumber}}, от {{contractDate}}",
    'Между {{customerName}} и {{contractorName}}',
  ],
  title: "СПЕЦИФИКАЦИЯ №{{specNumber}} от {{specDate}} г.",
  introParagraph:
    'Заказчик в лице {{customerRepresentative}}, действующего на основании договора № {{contractNumber}} от {{contractDate}} г., ' +
    'именуемый в дальнейшем "Заказчик", с одной стороны, и Исполнитель - {{contractorName}} в лице {{contractorRepresentative}}, ' +
    'действующего на основании {{contractorBasis}}, именуемое в дальнейшем "Исполнитель", с другой стороны, ' +
    "заключили настоящую Спецификацию о нижеследующем:",
  table: {
    columns: [
      { key: "index", label: "№", width: 28, align: "center" },
      { key: "name", label: "Товары", width: 175, align: "left" },
      { key: "unit", label: "Ед. измер.", width: 55, align: "center" },
      { key: "size", label: "Размер", width: 55, align: "center" },
      { key: "tnVed", label: "ТН ВЭД", width: 70, align: "center" },
      { key: "quantity", label: "Кол-во", width: 50, align: "right" },
      { key: "unitPrice", label: "Цена (рубль)", width: 65, align: "right" },
      { key: "sum", label: "Сумма (рубль)", width: 70, align: "right" },
    ],
  },
  footerLines: [
    "Общая сумма Спецификации №{{specNumber}} составляет: {{totalSumWords}}",
    "Условия оплаты: {{paymentTerms}}",
    "±10% отклонение: Допускается отклонение фактического количества товара от указанного в настоящей Спецификации в пределах ±10% без составления дополнительного соглашения.",
    "Период поставки: до {{deliveryDeadline}}.",
    "Производитель: {{producerAddress}}.",
    "Грузополучатель: {{consignee}}.",
    "Товар ненадлежащего качества подлежит возврату Исполнителю и повторному пошиву за счёт Исполнителя.",
    "Настоящая спецификация №{{specNumber}} является неотъемлемой частью к Договору № {{contractNumber}}, от {{contractDate}} г.",
  ],
  signatures: {
    left: { roleLine: "Исполнитель:", nameLine: "{{contractorName}}\n\n{{contractorSignerRole}}\n{{contractorSignerName}}" },
    right: { roleLine: "Заказчик:", nameLine: "{{customerName}}\n\n{{customerSignerName}}" },
  },
};
