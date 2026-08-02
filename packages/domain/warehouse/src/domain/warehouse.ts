import { DomainError } from "./errors";

export type WarehouseType = "own" | "workshop" | "marketplace_fbo" | "consignment";

// Склад — своя локация, WIP-локация у цеха, склад маркетплейса (FBO) или
// консигнационный склад (docs/DATABASE_SCHEMA.md, раздел 9).
export interface Warehouse {
  id: string;
  companyId: string;
  name: string;
  type: WarehouseType;
  country: string | null;
  workshopId: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidWarehouseName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название склада не может быть пустым", "WAREHOUSE_NAME_REQUIRED");
  }
}

// Инвариант из docs/DATABASE_SCHEMA.md, раздел 17: workshopId обязателен,
// когда type = 'workshop', и запрещён иначе (WIP-локация у конкретного цеха
// имеет смысл только для этого типа склада).
export function assertWorkshopIdConsistency(type: WarehouseType, workshopId: string | null): void {
  if (type === "workshop" && !workshopId) {
    throw new DomainError(
      "Для склада типа 'workshop' обязателен workshopId (какой именно цех)",
      "WAREHOUSE_WORKSHOP_ID_REQUIRED",
    );
  }
  if (type !== "workshop" && workshopId) {
    throw new DomainError(
      `workshopId допустим только для складов типа 'workshop', получен тип '${type}'`,
      "WAREHOUSE_WORKSHOP_ID_NOT_ALLOWED",
    );
  }
}
