// Акт приёмки оказанных услуг по пошиву — третий документ Document Template
// Engine (владелец проекта, 2026-09-21: «Контрактное производство» —
// закрывающий документ после приёмки партии, который делает услугу цеха
// официально принятой и подшитой к себестоимости; до этого у заказа была
// только спецификация — коммерческий заказ, но не подтверждение того, что
// именно было принято по факту). Тот же рендерер и геометрия, что у
// спецификации (applyPlaceholders/renderSpecification — ничего
// специфичного для спецификации в них нет, только структура шаблона),
// поэтому переиспользуются те же типы (SpecificationTemplateDefinition/
// SpecificationDocumentData) — заводить параллельный набор типов ради
// одинаковой формы данных значило бы дублировать код без причины.

import type { SpecificationTemplateDefinition } from "./specification-template";

// Эталон не сверялся с реальным напечатанным документом (в отличие от
// DEFAULT_SPECIFICATION_TEMPLATE) — это первая версия, составленная по
// обычной практике актов сдачи-приёмки услуг подряда в РФ/СНГ. Ключевое
// отличие от спецификации по смыслу: акт фиксирует ФАКТИЧЕСКИ принятое
// количество (receivedQuantity), а не заказанное, и является основанием для
// оплаты — правки текста по итогам реального использования ожидаемы.
export const ACT_TEMPLATE: SpecificationTemplateDefinition = {
  id: "act-default-ru",
  version: 1,
  name: "Акт приёмки оказанных услуг по пошиву (RU, по умолчанию)",
  titleLines: [
    "Акт №{{actNumber}} от {{actDate}} г.",
    "к Договору № {{contractNumber}} от {{contractDate}} г.",
    "Между {{contractorName}} и {{customerName}}",
  ],
  introParagraph:
    "1. Настоящий Акт составлен о том, что {{contractorName}} (Далее - Исполнитель) выполнил работы по пошиву, " +
    "а {{customerName}} (Далее - Заказчик) принял следующие товары:",
  // Та же ширина колонок, что у спецификации (473.4pt контента) — тот же
  // набор данных на строку (товар/ед.изм./размер/кол-во/цена/сумма), только
  // "Кол-во" здесь — фактически принятое количество, не заказанное.
  table: {
    columns: [
      { key: "index", label: "№", width: 28.4, align: "center", headerAlign: "center" },
      { key: "name", label: "Товары", width: 170.1, align: "left", headerAlign: "center" },
      { key: "unit", label: "Ед.\nизмер.", width: 48.2, align: "center", headerAlign: "center" },
      { key: "size", label: "Размер", width: 51.0, align: "center", headerAlign: "center" },
      { key: "quantity", label: "Принято", width: 48.2, align: "center", headerAlign: "center", totalAlign: "left" },
      { key: "unitPrice", label: "Цена\n(руб)", width: 51.0, align: "center", headerAlign: "center" },
      { key: "sum", label: "Сумма\n(руб)", width: 76.5, align: "center", headerAlign: "center", totalAlign: "left" },
    ],
  },
  totalSumLine: "Общая сумма оказанных услуг по Акту №{{actNumber}} составляет: {{totalSumNoDecimals}} руб.",
  footerLines: [
    "2. Работы выполнены полностью, в согласованные сроки. Заказчик претензий по объёму и качеству принятых товаров не имеет.",
    "3. Настоящий Акт является основанием для оплаты Исполнителю указанной суммы согласно условиям Договора № {{contractNumber}} от {{contractDate}} г.",
    "4. Настоящий Акт составлен в двух экземплярах для каждой стороны на русском языке, причём оба текста аутентичны.",
    "5. Настоящий Акт №{{actNumber}} является неотъемлемой частью Договора № {{contractNumber}} от {{contractDate}} г.",
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
