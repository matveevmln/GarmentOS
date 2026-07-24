import { DomainError } from "./errors";

export type SupplierType = "fabric" | "trim" | "packaging" | "logistics";
export type PartnerStatus = "draft" | "active" | "archived";

// Поставщик — категоризирован по типу (docs/DATABASE_SCHEMA.md, раздел 0b/6).
// status='draft' — контрагент, впервые упомянутый Inbox в необработанном
// документе, ещё не подтверждённый человеком (docs/INBOX_ARCHITECTURE.md, 2.1).
export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  type: SupplierType;
  status: PartnerStatus;
  inn: string | null;
  contactInfo: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function assertValidSupplierName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название поставщика не может быть пустым", "SUPPLIER_NAME_REQUIRED");
  }
}
