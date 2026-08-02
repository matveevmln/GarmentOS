import { assertValidWarehouseName, assertWorkshopIdConsistency, type Warehouse, type WarehouseType } from "../domain/warehouse";
import type { WarehouseRepository } from "./ports";

export interface CreateWarehouseInput {
  companyId: string;
  name: string;
  type?: WarehouseType;
  country?: string;
  workshopId?: string;
  createdBy?: string;
}

export interface CreateWarehouseDeps {
  warehouses: WarehouseRepository;
}

export async function createWarehouse(deps: CreateWarehouseDeps, input: CreateWarehouseInput): Promise<Warehouse> {
  const name = input.name.trim();
  const type = input.type ?? "own";
  assertValidWarehouseName(name);
  assertWorkshopIdConsistency(type, input.workshopId ?? null);

  return deps.warehouses.create({
    companyId: input.companyId,
    name,
    type,
    country: input.country?.trim() ?? null,
    workshopId: input.workshopId ?? null,
    createdBy: input.createdBy ?? null,
  });
}
