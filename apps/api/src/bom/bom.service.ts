import { Inject, Injectable } from "@nestjs/common";
import { approveBom, createBomDraft, createEmptyBom, getApprovedBom, type Bom, type BomRepository } from "@garmentos/domain-bom";
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

  // Тот же приём, что уже используется в bom-approval.provider.ts для прямого
  // POST /production-orders (ПРОМПТ №3, раздел 8 — «в новом workflow не
  // должно быть обязательного BOM-гейта»): модели без единого BOM выдаётся
  // пустой (0 позиций материалов) approved BOM автоматически, не блокируя
  // пользователя.
  //
  // До этой правки СПЕЦИФИКАЦИЯ→ПАРТИЯ (createProductionOrderFromSpecification
  // ниже, в SpecificationService) была ЕДИНСТВЕННЫМ путём создания партии,
  // где отсутствие BOM жёстко останавливало пользователя ошибкой
  // SPECIFICATION_PRODUCT_NORMS_NOT_APPROVED — притом что «Модель →
  // Спецификация → Партия» и есть основной документированный путь
  // (ProductionOrdersPage.tsx: «основной путь теперь Модель → Спецификация →
  // Партия»). Пользователь доходил до последнего шага (утверждённая
  // спецификация, сформированный PDF) и там впервые узнавал про требование,
  // о котором нигде раньше не предупреждали (аудит пользовательского пути,
  // owner, 2026-09-21, живой прогон «QA Стеганка»). Два входа в создание
  // партии обязаны вести себя одинаково.
  async ensureApproved(companyId: string, productId: string, createdBy: string | null): Promise<Bom> {
    const existing = await getApprovedBom({ boms: this.boms }, { companyId, productId });
    if (existing) return existing;
    const draft = await createEmptyBom({ boms: this.boms }, { companyId, productId, createdBy });
    return approveBom({ boms: this.boms }, { companyId, bomId: draft.id });
  }

  async listByProduct(companyId: string, productId: string): Promise<Bom[]> {
    return this.boms.listByProduct(companyId, productId);
  }
}
