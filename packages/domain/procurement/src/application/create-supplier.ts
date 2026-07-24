import { assertValidSupplierName, type PartnerStatus, type Supplier, type SupplierType } from "../domain/supplier";
import type { SupplierRepository } from "./ports";

export interface CreateSupplierInput {
  companyId: string;
  name: string;
  type: SupplierType;
  // По умолчанию 'active' (человек создаёт поставщика осознанно). Inbox
  // передаёт 'draft' явно, когда контрагент только упомянут в необработанном
  // документе и ещё не подтверждён (docs/INBOX_ARCHITECTURE.md, раздел 2.1) —
  // тот же use case, тот же путь для AI и человека (PRINCIPLES.md, принцип 15).
  status?: PartnerStatus;
  inn?: string;
  contactInfo?: string;
  createdBy?: string;
}

export interface CreateSupplierDeps {
  suppliers: SupplierRepository;
}

export async function createSupplier(deps: CreateSupplierDeps, input: CreateSupplierInput): Promise<Supplier> {
  const name = input.name.trim();
  assertValidSupplierName(name);

  return deps.suppliers.create({
    companyId: input.companyId,
    name,
    type: input.type,
    status: input.status ?? "active",
    inn: input.inn?.trim() ?? null,
    contactInfo: input.contactInfo?.trim() ?? null,
    createdBy: input.createdBy ?? null,
  });
}
