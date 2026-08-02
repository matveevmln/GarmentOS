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
  // 3 центрированные строки (номер/дата спецификации + стороны), без
  // отдельного правого блока реквизитов сверху (эталон 2026-07-26).
  titleLines: string[];
  introParagraph: string;
  table: { columns: SpecificationTemplateColumn[] };
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

// Эталонный шаблон (docs/DOCUMENT_ENGINE_ARCHITECTURE.md) — структура точно
// повторяет образец, присланный владельцем проекта 2026-07-26 (спецификация
// №1 к договору № П-22-04, ОсОО "Ак-Сарай Текстиль" / ИП Гашов А.А.): заголовок
// в три строки, вводный пункт "1.", таблица (Товары/Ед.измер./Размер/Кол-во/
// Цена/Сумма) без ТН ВЭД, итоговая строка, пункты 2-6 (условия оплаты, сроки
// и способ поставки, экземпляры на русском языке, вступление в силу), подписи
// без печатей (только место под подпись).
export const DEFAULT_SPECIFICATION_TEMPLATE: SpecificationTemplateDefinition = {
  id: "default-ru",
  version: 2,
  name: "Спецификация к договору пошива (RU, по умолчанию)",
  titleLines: [
    "Спецификация №{{specNumber}} к договору № {{contractNumber}}",
    "от {{contractDate}} г.",
    "Между {{contractorName}} и {{customerName}}",
  ],
  introParagraph:
    "1. В соответствии с Договором № {{contractNumber}} от {{contractDate}} г., {{contractorName}} (Далее - Исполнитель) " +
    "поставляет, а {{customerName}} (Далее - Заказчик) оплачивает следующие товары:",
  table: {
    columns: [
      { key: "index", label: "№", width: 25, align: "center" },
      { key: "name", label: "Товары", width: 190, align: "left" },
      { key: "unit", label: "Ед. измер.", width: 45, align: "center" },
      { key: "size", label: "Размер", width: 55, align: "center" },
      { key: "quantity", label: "Кол-во", width: 45, align: "right" },
      { key: "unitPrice", label: "Цена (руб)", width: 65, align: "right" },
      { key: "sum", label: "Сумма (руб)", width: 80, align: "right" },
    ],
  },
  footerLines: [
    "2. Условия платежа: {{paymentTerms}}",
    "3. Сроки поставки: {{deliveryDeadline}}",
    "4. Способ доставки товаров: {{deliveryMethod}}",
    "5. Настоящая Спецификация составлена в двух экземплярах для каждой стороны на русском языке, причём оба текста аутентичны.",
    "6. Настоящая Спецификация вступает в силу с момента её подписания.",
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
