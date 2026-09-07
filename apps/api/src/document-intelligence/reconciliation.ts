import type { DocumentReconciliationFieldDto } from "@garmentos/shared-types";
import type { ExtractedDocumentFields } from "../ai-production-assistant/document-extraction-types";

// Арифметическая сверка (P6.8) — сумма по строкам документа против итога,
// который в этом же документе заявлен. Это ПРОВЕРКА/ПРЕДУПРЕЖДЕНИЕ, а не
// исправление: ни строки, ни заявленный итог этой функцией никогда не
// меняются, только вычисляется третье, независимое число для сравнения.
// Округление денег/веса в реальных документах — используем допуск, а не
// строгое равенство (тот же принцип, что и допуск 0.0005 для количеств в
// production-order.ts, здесь чуть шире — 0.01 — потому что суммы обычно
// заданы с точностью до копейки/сотой кг, а не до тысячной).
const TOLERANCE = 0.01;

function reconcile(label: string, sumOfLines: number, statedTotal: number | null, complete: boolean): DocumentReconciliationFieldDto {
  if (statedTotal === null || !complete) {
    return { label, sumOfLines, statedTotal, difference: null, status: "unknown" };
  }
  const difference = Number((sumOfLines - statedTotal).toFixed(2));
  return {
    label,
    sumOfLines,
    statedTotal,
    difference,
    status: Math.abs(difference) <= TOLERANCE ? "match" : "discrepancy",
  };
}

function sumField(
  lines: ExtractedDocumentFields["lines"],
  pick: (line: ExtractedDocumentFields["lines"][number]) => number | null,
): { sum: number; complete: boolean; anyPresent: boolean } {
  let sum = 0;
  let complete = true;
  let anyPresent = false;
  for (const line of lines) {
    const value = pick(line);
    if (value === null) {
      complete = false;
      continue;
    }
    anyPresent = true;
    sum += value;
  }
  return { sum: Number(sum.toFixed(2)), complete, anyPresent };
}

// Инвойс: сумма по строкам = Σ(quantity × unitPrice) — ровно формула из
// задания (P5's computeSpecificationLinePricing/computeProductionOrderBatchSum
// используют тот же принцип "построчно, не одним числом", здесь применён к
// закупочному документу, а не к заказу пошива — независимая, но
// однотипная логика).
function reconcileInvoice(extracted: ExtractedDocumentFields): DocumentReconciliationFieldDto[] {
  let sum = 0;
  let complete = true;
  let anyPresent = false;
  for (const line of extracted.lines) {
    if (line.quantity === null || line.unitPrice === null) {
      complete = false;
      continue;
    }
    anyPresent = true;
    sum += line.quantity * line.unitPrice;
  }
  sum = Number(sum.toFixed(2));
  if (!anyPresent && extracted.totalAmount === null) return [];
  return [reconcile("Сумма по строкам", sum, extracted.totalAmount, complete)];
}

function reconcilePackingList(extracted: ExtractedDocumentFields): DocumentReconciliationFieldDto[] {
  const fields: DocumentReconciliationFieldDto[] = [];

  const packages = sumField(extracted.lines, (l) => l.packageCount);
  if (packages.anyPresent || extracted.totalPackages !== null) {
    fields.push(reconcile("Количество мест", packages.sum, extracted.totalPackages, packages.complete));
  }

  const netWeight = sumField(extracted.lines, (l) => l.netWeight);
  if (netWeight.anyPresent || extracted.totalNetWeight !== null) {
    fields.push(reconcile("Вес нетто", netWeight.sum, extracted.totalNetWeight, netWeight.complete));
  }

  const grossWeight = sumField(extracted.lines, (l) => l.grossWeight);
  if (grossWeight.anyPresent || extracted.totalGrossWeight !== null) {
    fields.push(reconcile("Вес брутто", grossWeight.sum, extracted.totalGrossWeight, grossWeight.complete));
  }

  const cbm = sumField(extracted.lines, (l) => l.cbm);
  if (cbm.anyPresent || extracted.totalCbm !== null) {
    fields.push(reconcile("Объём (CBM)", cbm.sum, extracted.totalCbm, cbm.complete));
  }

  return fields;
}

export function computeDocumentReconciliation(extracted: ExtractedDocumentFields): DocumentReconciliationFieldDto[] {
  return extracted.documentType === "invoice" ? reconcileInvoice(extracted) : reconcilePackingList(extracted);
}
