import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  parseProductionRequestSchema,
  parsedProductionRequestResponseSchema,
  type ParsedProductionRequestResponseDto,
} from "@garmentos/shared-types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProductionRequestService } from "./production-request.service";

class ParseProductionRequestDto extends createZodDto(parseProductionRequestSchema) {}

@ApiTags("ai-production-assistant")
@Controller("production-requests")
export class ProductionRequestController {
  constructor(private readonly productionRequestService: ProductionRequestService) {}

  // Разбор текста/голоса в структурированные объёмы по цвету/размеру
  // (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md, раздел 2) — не создаёт
  // доменных записей, только готовит данные для следующего шага сценария
  // (создание черновика заказа пошива, Итерация 7, пункт 55).
  @RequirePermissions("contract_manufacturing.write")
  @Post("parse")
  async parse(@Body() body: ParseProductionRequestDto): Promise<ParsedProductionRequestResponseDto> {
    const parsed = await this.productionRequestService.parse(body.text);
    return parsedProductionRequestResponseSchema.parse(parsed);
  }
}
