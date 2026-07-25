import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { ensureMarketplaceSchema, marketplaceResponseSchema, type MarketplaceResponseDto } from "@garmentos/shared-types";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

class EnsureMarketplaceDto extends createZodDto(ensureMarketplaceSchema) {}

@ApiTags("marketplaces")
@Controller("marketplaces")
export class MarketplacesController {
  constructor(private readonly marketplaceIntegrationService: MarketplaceIntegrationService) {}

  @Post("ensure")
  async ensure(@Body() body: EnsureMarketplaceDto): Promise<MarketplaceResponseDto> {
    const marketplace = await this.marketplaceIntegrationService.ensureMarketplace(body);
    return marketplaceResponseSchema.parse(marketplace);
  }
}
