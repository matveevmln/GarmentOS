import { DomainError } from "../domain/errors";
import {
  assertCanApprove,
  computePrepaymentAmount,
  SPECIFICATION_PREPAYMENT_PERCENT,
  type Specification,
  type SpecificationSnapshot,
} from "../domain/specification";
import type { SpecificationRepository, WorkshopLookupPort } from "./ports";

export interface ApproveSpecificationLine {
  productVariantId: string;
  name: string;
  unit: string;
  size: string;
}

export interface ApproveSpecificationInput {
  companyId: string;
  specificationId: string;
  // Данные, которых нет у домена specification (чужие модули — Product/
  // Workshop/Company) — apps/api собирает их из соответствующих сервисов
  // непосредственно перед вызовом (docs/PRINCIPLES.md, принцип 2).
  product: { name: string; code: string };
  workshop: {
    name: string;
    contractNumber: string | null;
    contractDate: string | null;
    paymentTerms: string | null;
    deliveryMethod: string | null;
    legalAddress: string | null;
    signerRole: string | null;
    signerName: string | null;
  };
  company: { legalName: string; signerName: string | null };
  // Человекочитаемые название/единица/размер для каждой строки — сама
  // specification_items хранит только productVariantId, снимок должен
  // остаться читаемым и после того, как модель/вариант переименуют.
  itemLines: ApproveSpecificationLine[];
}

export interface ApproveSpecificationDeps {
  specifications: SpecificationRepository;
  workshops: WorkshopLookupPort;
}

// Утверждение — необратимый коммит (требование №9): резервирует номер
// (атомарно, через существующий счётчик цеха), замораживает snapshot
// (требование №4, №10) и рассчитывает предоплату 70% от уже
// зафиксированной суммы (требование №7) — всё одной операцией.
export async function approveSpecification(
  deps: ApproveSpecificationDeps,
  input: ApproveSpecificationInput,
): Promise<Specification> {
  const spec = await deps.specifications.findById(input.companyId, input.specificationId);
  if (!spec) {
    throw new DomainError(`Спецификация ${input.specificationId} не найдена`, "SPECIFICATION_NOT_FOUND");
  }
  assertCanApprove(spec.status);

  const lineByVariant = new Map(input.itemLines.map((line) => [line.productVariantId, line]));
  const items = [...spec.items]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const line = lineByVariant.get(item.productVariantId);
      if (!line) {
        throw new DomainError(
          `Отсутствуют данные варианта ${item.productVariantId} для снимка спецификации`,
          "SPECIFICATION_SNAPSHOT_LINE_MISSING",
        );
      }
      return { name: line.name, unit: line.unit, size: line.size, quantity: item.quantity, unitPrice: item.unitPrice, sum: item.sum };
    });

  const prepaymentAmount = computePrepaymentAmount(Number(spec.totalSum));

  const snapshot: SpecificationSnapshot = {
    product: input.product,
    workshop: input.workshop,
    company: input.company,
    items,
    totals: { quantity: spec.totalQuantity, sum: spec.totalSum },
    prepaymentAmount: String(prepaymentAmount),
    prepaymentPercent: SPECIFICATION_PREPAYMENT_PERCENT,
    deliveryDeadline: spec.deliveryDeadline,
  };

  const specNumber = await deps.workshops.reserveNextSpecificationNumber(spec.workshopId);

  return deps.specifications.approve(input.companyId, spec.id, { specNumber, prepaymentAmount, snapshotJson: snapshot });
}
