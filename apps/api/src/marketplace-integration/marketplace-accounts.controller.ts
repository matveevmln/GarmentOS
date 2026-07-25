import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createMarketplaceAccountSchema,
  marketplaceAccountResponseSchema,
  toggleMarketplaceAccountSchema,
  type MarketplaceAccountResponseDto,
} from "@garmentos/shared-types";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

class CreateMarketplaceAccountDto extends createZodDto(createMarketplaceAccountSchema) {}
class ToggleMarketplaceAccountDto extends createZodDto(toggleMarketplaceAccountSchema) {}

@ApiTags("marketplace-accounts")
@Controller("marketplace-accounts")
export class MarketplaceAccountsController {
  constructor(private readonly marketplaceIntegrationService: MarketplaceIntegrationService) {}

  @Post()
  async create(@Body() body: CreateMarketplaceAccountDto): Promise<MarketplaceAccountResponseDto> {
    const account = await this.marketplaceIntegrationService.createMarketplaceAccount(body);
    return marketplaceAccountResponseSchema.parse(account);
  }

  @Post(":id/activate")
  async activate(
    @Param("id") id: string,
    @Body() body: ToggleMarketplaceAccountDto,
  ): Promise<MarketplaceAccountResponseDto> {
    const account = await this.marketplaceIntegrationService.activateMarketplaceAccount(body.companyId, id);
    return marketplaceAccountResponseSchema.parse(account);
  }

  @Post(":id/deactivate")
  async deactivate(
    @Param("id") id: string,
    @Body() body: ToggleMarketplaceAccountDto,
  ): Promise<MarketplaceAccountResponseDto> {
    const account = await this.marketplaceIntegrationService.deactivateMarketplaceAccount(body.companyId, id);
    return marketplaceAccountResponseSchema.parse(account);
  }
}
