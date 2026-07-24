import { assertValidMaterialName, type Material, type MaterialType, type MaterialUnit } from "../domain/material";
import type { MaterialRepository } from "./ports";

export interface CreateMaterialInput {
  companyId: string;
  name: string;
  type: MaterialType;
  unit: MaterialUnit;
  reorderPoint?: number;
  createdBy?: string;
}

export interface CreateMaterialDeps {
  materials: MaterialRepository;
}

export async function createMaterial(deps: CreateMaterialDeps, input: CreateMaterialInput): Promise<Material> {
  const name = input.name.trim();
  assertValidMaterialName(name);

  return deps.materials.create({
    companyId: input.companyId,
    name,
    type: input.type,
    unit: input.unit,
    reorderPoint: input.reorderPoint !== undefined ? String(input.reorderPoint) : null,
    createdBy: input.createdBy ?? null,
  });
}
