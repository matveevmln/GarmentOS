import { describe, expect, it } from "vitest";
import type { ExtractedDocumentFields } from "../ai-production-assistant/document-extraction-types";
import { computeDocumentReconciliation } from "./reconciliation";

// Реальный пример владельца проекта (P6): инвойс RB-260628, 3 позиции,
// заявленный итог $27,856.98 — сумма по строкам совпадает (в пределах
// допуска на округление копеек), сверка должна дать "match".
function buildInvoice(overrides: Partial<ExtractedDocumentFields> = {}): ExtractedDocumentFields {
  return {
    documentType: "invoice",
    supplierName: "ABC Textile",
    documentNumber: "RB-260628",
    documentDate: "2026-06-28",
    currency: "USD",
    totalAmount: 27856.98,
    totalPackages: null,
    totalNetWeight: null,
    totalGrossWeight: null,
    totalCbm: null,
    lines: [
      {
        description: "стеганое полотно",
        materialCode: null,
        color: null,
        quantity: 4843.7,
        unit: "kg",
        unitPrice: 4.1,
        lineTotal: 19859.17,
        packageCount: null,
        packageUnit: null,
        netWeight: null,
        grossWeight: null,
        cbm: null,
      },
      {
        description: "подклад",
        materialCode: null,
        color: null,
        quantity: 4624.4,
        unit: "m",
        unitPrice: 0.75,
        lineTotal: 3468.3,
        packageCount: null,
        packageUnit: null,
        netWeight: null,
        grossWeight: null,
        cbm: null,
      },
      {
        description: "плащевка",
        materialCode: null,
        color: null,
        quantity: 4767.9,
        unit: "m",
        unitPrice: 0.95,
        lineTotal: 4529.51,
        packageCount: null,
        packageUnit: null,
        netWeight: null,
        grossWeight: null,
        cbm: null,
      },
    ],
    ...overrides,
  };
}

// Пакинг-лист к тому же инвойсу: 251 место / 5709.30 кг нетто / 5780.80 кг
// брутто — сходится построчно. Объём (CBM) указан только на первой строке
// (40), остальные — явный 0 (места учтены в одном контейнере первой
// строки) — заявленный итог 42 CBM: полные данные по всем строкам, но
// сумма не сходится с заявленным итогом — реальный пример "discrepancy".
function buildPackingList(): ExtractedDocumentFields {
  return {
    documentType: "packing_list",
    supplierName: "ABC Textile",
    documentNumber: "RB-260628",
    documentDate: "2026-06-28",
    currency: null,
    totalAmount: null,
    totalPackages: 251,
    totalNetWeight: 5709.3,
    totalGrossWeight: 5780.8,
    totalCbm: 42,
    lines: [
      {
        description: "стеганое полотно",
        materialCode: null,
        color: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        lineTotal: null,
        packageCount: 213,
        packageUnit: "bales",
        netWeight: 4843.7,
        grossWeight: 4907.6,
        cbm: 40,
      },
      {
        description: "подклад",
        materialCode: null,
        color: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        lineTotal: null,
        packageCount: 18,
        packageUnit: "bales",
        netWeight: 363.7,
        grossWeight: 367.3,
        cbm: 0,
      },
      {
        description: "плащевка",
        materialCode: null,
        color: null,
        quantity: null,
        unit: null,
        unitPrice: null,
        lineTotal: null,
        packageCount: 20,
        packageUnit: "bales",
        netWeight: 501.9,
        grossWeight: 505.9,
        cbm: 0,
      },
    ],
  };
}

describe("computeDocumentReconciliation", () => {
  it("инвойс: сумма по строкам совпадает с заявленным итогом — status match", () => {
    const result = computeDocumentReconciliation(buildInvoice());

    expect(result).toHaveLength(1);
    expect(result[0]?.label).toBe("Сумма по строкам");
    expect(result[0]?.statedTotal).toBe(27856.98);
    expect(result[0]?.status).toBe("match");
    expect(Math.abs(result[0]?.difference ?? 1)).toBeLessThanOrEqual(0.01);
  });

  it("пакинг-лист: места/вес нетто/вес брутто совпадают, объём — genuine discrepancy", () => {
    const result = computeDocumentReconciliation(buildPackingList());

    const byLabel = new Map(result.map((field) => [field.label, field]));

    expect(byLabel.get("Количество мест")).toMatchObject({ sumOfLines: 251, statedTotal: 251, status: "match" });
    expect(byLabel.get("Вес нетто")).toMatchObject({ sumOfLines: 5709.3, statedTotal: 5709.3, status: "match" });
    expect(byLabel.get("Вес брутто")).toMatchObject({ sumOfLines: 5780.8, statedTotal: 5780.8, status: "match" });

    const cbm = byLabel.get("Объём (CBM)");
    expect(cbm?.sumOfLines).toBe(40);
    expect(cbm?.statedTotal).toBe(42);
    expect(cbm?.status).toBe("discrepancy");
    expect(cbm?.difference).toBe(-2);
  });

  it("не изменяет ни исходные строки, ни заявленный итог — только вычисляет отдельное значение для сравнения", () => {
    const invoice = buildInvoice();
    const snapshot = JSON.parse(JSON.stringify(invoice)) as ExtractedDocumentFields;

    computeDocumentReconciliation(invoice);

    expect(invoice).toEqual(snapshot);
  });

  it("отсутствующие построчные данные дают status unknown, а не ложное совпадение/расхождение", () => {
    const invoice = buildInvoice();
    invoice.lines[1].unitPrice = null;

    const result = computeDocumentReconciliation(invoice);

    expect(result[0]?.status).toBe("unknown");
    expect(result[0]?.difference).toBeNull();
  });

  it("нет позиций и нет заявленного итога — пустой результат (нечего сверять)", () => {
    const invoice = buildInvoice({ totalAmount: null, lines: [] });

    const result = computeDocumentReconciliation(invoice);

    expect(result).toEqual([]);
  });
});
