import type { Specification, SpecificationItem, SpecificationItemDraft, SpecificationSnapshot, SpecificationStatus } from "../domain/specification";

export interface NewSpecificationInput {
  companyId: string;
  workshopId: string;
  productId: string;
  status: SpecificationStatus;
  version: number;
  basedOnSpecificationId: string | null;
  deliveryDeadline: string | null;
  totalQuantity: number;
  totalSum: number;
  createdBy: string | null;
  items: Array<SpecificationItemDraft & { sum: number }>;
}

export interface SpecificationRepository {
  create(input: NewSpecificationInput): Promise<Specification>;
  findById(companyId: string, id: string): Promise<Specification | null>;
  listByCompany(companyId: string, filter?: { productId?: string; workshopId?: string; status?: SpecificationStatus }): Promise<Specification[]>;
  // Утверждение — одна атомарная операция (не update statusа отдельно от
  // остального): номер, snapshot и итоговая предоплата фиксируются вместе с
  // переходом в approved, чтобы не было промежуточного состояния "approved,
  // но без номера/снимка" при сбое между шагами. companyId — defense-in-depth
  // (аудит IDOR перед Этапом 2): единственный вызывающий уже проверяет
  // findById(companyId, id) до approve, но сам SQL обязан фильтровать по
  // компании и собственными силами, а не полагаться на порядок вызовов.
  approve(
    companyId: string,
    id: string,
    input: { specNumber: number; prepaymentAmount: number; snapshotJson: SpecificationSnapshot },
  ): Promise<Specification>;
}

export type SpecificationItemRow = SpecificationItem;

// Узкие порты в чужие доменные модули (docs/PRINCIPLES.md, принцип 2 — тот
// же паттерн, что BomApprovalPort в contract-manufacturing): этот пакет не
// зависит рантаймом ни от @garmentos/domain-contract-manufacturing, ни от
// @garmentos/domain-catalog — только от структурно совместимых интерфейсов,
// которые apps/api подключает через реальные сервисы этих модулей.
export interface WorkshopLookupPort {
  findById(companyId: string, workshopId: string): Promise<{ id: string } | null>;
  // Атомарно резервирует следующий номер спецификации по договору цеха —
  // тот же счётчик (workshops.nextSpecificationNumber), что уже
  // использовался для генерации PDF; точка вызова просто переносится на
  // approve спецификации (требование №11).
  reserveNextSpecificationNumber(workshopId: string): Promise<number>;
}

export interface ProductLookupPort {
  findById(companyId: string, productId: string): Promise<{ id: string } | null>;
}

export interface ProductVariantLookupPort {
  findById(companyId: string, productVariantId: string): Promise<{ id: string; productId: string } | null>;
}
