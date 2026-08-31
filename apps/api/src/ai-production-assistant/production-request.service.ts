import { Inject, Injectable } from "@nestjs/common";
import type { AIClassifier } from "./ai-classifier";
import { AI_CLASSIFIER } from "./ai-production-assistant.tokens";
import { buildParsedProductionRequest, type ParsedProductionRequest } from "./production-request-parser";
import { CatalogService } from "../catalog/catalog.service";

@Injectable()
export class ProductionRequestService {
  constructor(
    @Inject(AI_CLASSIFIER) private readonly aiClassifier: AIClassifier,
    private readonly catalogService: CatalogService,
  ) {}

  // Раскладка берётся из карточки распознанной модели (владелец проекта,
  // 2026-08-30) — тот же механизм, что и в веб-форме. Если модель в каталоге
  // не найдена (свободный текст может назвать что угодно) или ряд не задан,
  // веса остаются пустыми и количество делится поровну; вызывающий всё равно
  // сообщит пользователю, что модель не найдена.
  async parse(companyId: string, text: string): Promise<ParsedProductionRequest> {
    const fields = await this.aiClassifier.extractProductionRequestFields(text);
    const product = await this.catalogService.findProductByName(companyId, fields.modelName);
    const sizes = product ? await this.catalogService.listProductSizes(product.id) : [];
    const weights = new Map(sizes.map((size) => [size.size, Number(size.ratioWeight)]));
    return buildParsedProductionRequest(fields, weights);
  }
}
