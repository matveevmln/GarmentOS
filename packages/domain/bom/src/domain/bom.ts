import { DomainError } from "./errors";

export type BomStatus = "draft" | "approved" | "archived";

export interface BomItem {
  id: string;
  bomId: string;
  materialId: string;
  quantityPerUnit: string;
  wastePercent: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Bom {
  id: string;
  companyId: string;
  productId: string;
  version: number;
  status: BomStatus;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: BomItem[];
}

export interface BomItemDraft {
  materialId: string;
  quantityPerUnit: number;
  wastePercent?: number;
}

// Спецификация не имеет смысла без хотя бы одной строки расхода материала
// (docs/DATABASE_SCHEMA.md, раздел 7).
export function assertHasItems(items: BomItemDraft[]): void {
  if (items.length === 0) {
    throw new DomainError("Спецификация (BOM) должна содержать хотя бы один материал", "BOM_EMPTY");
  }
}

export function assertValidItem(item: BomItemDraft): void {
  if (item.quantityPerUnit <= 0) {
    throw new DomainError(
      `Норма расхода материала должна быть положительной (получено ${item.quantityPerUnit})`,
      "BOM_ITEM_QUANTITY_INVALID",
    );
  }
  if (item.wastePercent !== undefined && item.wastePercent < 0) {
    throw new DomainError(
      `Процент отходов не может быть отрицательным (получено ${item.wastePercent})`,
      "BOM_ITEM_WASTE_INVALID",
    );
  }
}

// Инвариант, найденный в USER_JOURNEY_AUDIT.md и зафиксированный в ROADMAP.md
// (Итерация 3): BOM должен быть approved прежде, чем по нему можно разместить
// заказ пошива — здесь его первая половина (нельзя утвердить черновик дважды
// или утвердить архивную версию).
export function assertCanApprove(status: BomStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      `Нельзя утвердить BOM в статусе "${status}" — утверждение доступно только для черновика`,
      "BOM_NOT_DRAFT",
    );
  }
}
