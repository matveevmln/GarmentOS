import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductionOrderFromTextSchema,
  parseProductionRequestSchema,
  parsedProductionRequestResponseSchema,
  productionOrderResponseSchema,
  type ParsedProductionRequestResponseDto,
  type ProductionOrderResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProductionOrderOrchestrationService } from "./production-order-orchestration.service";
import { ProductionRequestService } from "./production-request.service";

class ParseProductionRequestDto extends createZodDto(parseProductionRequestSchema) {}
class CreateProductionOrderFromTextDto extends createZodDto(createProductionOrderFromTextSchema) {}

@ApiTags("ai-production-assistant")
@Controller("production-requests")
export class ProductionRequestController {
  constructor(
    private readonly productionRequestService: ProductionRequestService,
    private readonly orchestrationService: ProductionOrderOrchestrationService,
  ) {}

  // Разбор текста/голоса в структурированные объёмы по цвету/размеру
  // (docs/AI_PRODUCTION_ASSISTANT_ARCHITECTURE.md, раздел 2) — не создаёт
  // доменных записей, только готовит данные для следующего шага сценария.
  @RequirePermissions("contract_manufacturing.write")
  @Post("parse")
  async parse(@Body() body: ParseProductionRequestDto): Promise<ParsedProductionRequestResponseDto> {
    const parsed = await this.productionRequestService.parse(body.text);
    return parsedProductionRequestResponseSchema.parse(parsed);
  }

  // Полный путь текст → черновик заказа пошива: разбор + резолв модели/BOM/SKU
  // из каталога + createProductionOrderDraft (Итерация 7, вертикальный сценарий).
  @RequirePermissions("contract_manufacturing.write")
  @Post("create-order")
  async createOrder(
    @Body() body: CreateProductionOrderFromTextDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderResponseDto> {
    const order = await this.orchestrationService.createFromText(
      currentUser.companyId,
      currentUser.id,
      body.workshopId,
      body.text,
    );
    return productionOrderResponseSchema.parse(order);
  }
}
