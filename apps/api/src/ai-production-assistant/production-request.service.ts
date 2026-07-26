import { Inject, Injectable } from "@nestjs/common";
import type { AIClassifier } from "./ai-classifier";
import { AI_CLASSIFIER } from "./ai-production-assistant.tokens";
import { buildParsedProductionRequest, type ParsedProductionRequest } from "./production-request-parser";

@Injectable()
export class ProductionRequestService {
  constructor(@Inject(AI_CLASSIFIER) private readonly aiClassifier: AIClassifier) {}

  async parse(text: string): Promise<ParsedProductionRequest> {
    const fields = await this.aiClassifier.extractProductionRequestFields(text);
    return buildParsedProductionRequest(fields);
  }
}
