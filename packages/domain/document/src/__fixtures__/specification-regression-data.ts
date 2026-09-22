import type { SpecificationDocumentData } from "../domain/specification-template";

// Фиксированный набор данных для PDF-regression теста калибровки
// спецификации (владелец проекта, 2026-09-22 — «REGRESSION-ТЕСТ НА
// ЭТАЛОННЫЙ PDF СПЕЦИФИКАЦИИ»). Покрывает КАЖДЫЙ placeholder из
// DEFAULT_SPECIFICATION_TEMPLATE (сверено вручную со списком {{...}} в
// domain/specification-template.ts — specDate, legalAddress,
// totalSumNoDecimals включены намеренно: пример в document.spec.ts их не
// заполняет и поэтому никогда не проверял их фактическое отображение).
//
// НЕ менять эти значения ради удобства теста — любое изменение здесь
// меняет ожидаемую геометрию текста и требует осознанного пересчёта
// baseline (см. regenerate-baseline.script.ts в этой же папке). Значения
// подобраны так, чтобы упомянутые в задаче пункты калибровки были реально
// задействованы:
//  - "specDate", "legalAddress", "totalSumNoDecimals" — отдельные поля;
//  - условия оплаты — предоплата 70%/ЭСФ/±10%, как в реальном тексте цеха;
//  - цвет на отдельной строке в ячейке Products — items[].name содержит
//    "\n" между моделью и цветом (тот же приём, что и в
//    specification.service.ts: `${product.name}\n${item.color}`).
export const SPECIFICATION_REGRESSION_DATA: SpecificationDocumentData = {
  fields: {
    contractNumber: "П-22-04",
    contractDate: "22.04.2026",
    specNumber: "7",
    specDate: "24.09.2026",
    customerName: "ИП Гашов А.А.",
    contractorName: 'ОсОО "Ак-Сарай Текстиль"',
    paymentTerms:
      "Предоплата 70% в течение 3 (трёх) рабочих дней с момента выставления счёта, остаток 30% по факту приёмки. Расчёты по ЭСФ, допустимое отклонение количества по каждой позиции ±10%.",
    deliveryDeadline: "30 июня 2026",
    deliveryMethod: "Самовывоз.",
    legalAddress: "Кыргызская Республика, г. Бишкек, ул. Тестовая, 1",
    contractorSignerRole: "Генеральный директор",
    contractorSignerName: "Нормуродов О.А.",
    customerSignerName: "Гашов А.А.",
    totalSumNoDecimals: "216 000",
  },
  items: [
    { name: "Двойка\nПетроль", unit: "шт", size: "48-50", quantity: "200", unitPrice: "720,00", sum: "144 000,00" },
    { name: "Двойка\nБордо", unit: "шт", size: "48-50", quantity: "100", unitPrice: "720,00", sum: "72 000,00" },
  ],
  totals: { quantity: "300", sum: "216 000,00" },
};
