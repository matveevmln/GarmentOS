import type { Bom } from "../domain/bom";
import type { BomRepository } from "./ports";

export interface CreateEmptyBomInput {
  companyId: string;
  productId: string;
  createdBy?: string | null;
}

export interface CreateEmptyBomDeps {
  boms: BomRepository;
}

// ПРОМПТ №3, раздел 8 — «в новом пользовательском workflow не должно быть
// обязательного BOM/material availability gate»: заказ пошива создаётся без
// выбора норм расхода. Модели, для которой ещё ни разу не заводили BOM,
// нужен хоть какой-то approved BOM (bom_id в production_orders — NOT NULL,
// расчёт себестоимости в CostingService ищет approved BOM по модели) — этот
// use case создаёт его пустым (0 позиций материалов), НЕ проходя через
// createBomDraft/assertHasItems (та проверка остаётся в силе для обычного,
// ручного заведения норм расхода — этот путь используется только здесь,
// автоматически, и не отображается пользователю как отдельное действие).
// Пустой BOM = все компоненты себестоимости по материалам считаются нулём
// (CostingService.computeSpecificationPricing уже терпим к bom.items === []
// без каких-либо изменений) — не гейт, а нейтральный факт "материалы для
// этой модели пока не описаны".
export async function createEmptyBom(deps: CreateEmptyBomDeps, input: CreateEmptyBomInput): Promise<Bom> {
  const existingCount = await deps.boms.countByProduct(input.companyId, input.productId);
  return deps.boms.create({
    companyId: input.companyId,
    productId: input.productId,
    version: existingCount + 1,
    status: "draft",
    createdBy: input.createdBy ?? null,
    items: [],
  });
}
