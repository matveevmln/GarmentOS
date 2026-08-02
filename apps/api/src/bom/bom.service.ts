import { Inject, Injectable } from "@nestjs/common";
import { approveBom, createBomDraft, getApprovedBom, type Bom, type BomRepository } from "@garmentos/domain-bom";
import type { CreateBomDraftDto, GetApprovedBomQueryDto } from "@garmentos/shared-types";
import { BOM_REPOSITORY } from "./bom.tokens";

// Тонкий presentation-адаптер поверх packages/domain/bom (docs/ARCHITECTURE.md,
// раздел 2) — репозиторий внедряется через DI по токену доменного порта.
@Injectable()
export class BomService {
  constructor(@Inject(BOM_REPOSITORY) private readonly boms: BomRepository) {}

  async createDraft(companyId: string, input: CreateBomDraftDto): Promise<Bom> {
    return createBomDraft({ boms: this.boms }, { ...input, companyId });
  }

  async approve(companyId: string, bomId: string): Promise<Bom> {
    return approveBom({ boms: this.boms }, { companyId, bomId });
  }

  async getApproved(companyId: string, query: GetApprovedBomQueryDto): Promise<Bom | null> {
    return getApprovedBom({ boms: this.boms }, { ...query, companyId });
  }

  async listByProduct(companyId: string, productId: string): Promise<Bom[]> {
    return this.boms.listByProduct(companyId, productId);
  }
}
