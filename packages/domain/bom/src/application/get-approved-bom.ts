import type { Bom } from "../domain/bom";
import type { BomRepository } from "./ports";

export interface GetApprovedBomInput {
  companyId: string;
  productId: string;
}

export interface GetApprovedBomDeps {
  boms: BomRepository;
}

// Query, не use case в строгом смысле (ничего не меняет) — публичная точка
// входа, через которую ДРУГИЕ модули (Contract Manufacturing) проверяют
// инвариант «нельзя разместить заказ пошива без утверждённого BOM»
// (docs/ROADMAP.md, Итерация 3), не читая таблицу boms напрямую
// (docs/PRINCIPLES.md, принцип 2 — границы модуля).
export async function getApprovedBom(deps: GetApprovedBomDeps, input: GetApprovedBomInput): Promise<Bom | null> {
  return deps.boms.findLatestApproved(input.companyId, input.productId);
}
