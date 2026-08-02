import { DomainError } from "./errors";

export type MaterialType = "fabric" | "trim" | "packaging" | "accessory";
export type MaterialUnit = "m" | "kg" | "pcs";

// Материал (в т.ч. упаковка) — используется в BOM и закупках
// (docs/DATABASE_SCHEMA.md, раздел 6; CLAUDE.md, глоссарий).
export interface Material {
  id: string;
  companyId: string;
  name: string;
  type: MaterialType;
  unit: MaterialUnit;
  reorderPoint: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function assertValidMaterialName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название материала не может быть пустым", "MATERIAL_NAME_REQUIRED");
  }
}
