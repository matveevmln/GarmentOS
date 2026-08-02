import type { Bom, BomItemDraft, BomStatus } from "../domain/bom";

export interface NewBomInput {
  companyId: string;
  productId: string;
  version: number;
  status: BomStatus;
  createdBy: string | null;
  items: BomItemDraft[];
}

export interface BomRepository {
  create(input: NewBomInput): Promise<Bom>;
  findById(companyId: string, id: string): Promise<Bom | null>;
  countByProduct(companyId: string, productId: string): Promise<number>;
  updateStatus(id: string, status: BomStatus): Promise<Bom>;
  // Последняя утверждённая версия BOM для модели — используется как источник
  // истины для инварианта "нельзя разместить заказ в цех без approved BOM"
  // (docs/ROADMAP.md, Итерация 3), в т.ч. другими модулями через публичный
  // getApprovedBom (см. index.ts), не прямым доступом к этой таблице.
  findLatestApproved(companyId: string, productId: string): Promise<Bom | null>;
  listByProduct(companyId: string, productId: string): Promise<Bom[]>;
}
