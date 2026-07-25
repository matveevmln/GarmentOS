import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createMarketplaceAccountSchema,
  marketplaceAccountResponseSchema,
  type MarketplaceAccountResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

class CreateMarketplaceAccountDto extends createZodDto(createMarketplaceAccountSchema) {}

@ApiTags("marketplace-accounts")
@Controller("marketplace-accounts")
export class MarketplaceAccountsController {
  constructor(private readonly marketplaceIntegrationService: MarketplaceIntegrationService) {}

  @RequirePermissions("marketplace_integration.write")
  @Post()
  async create(
    @Body() body: CreateMarketplaceAccountDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarketplaceAccountResponseDto> {
    const account = await this.marketplaceIntegrationService.createMarketplaceAccount(currentUser.companyId, body);
    return marketplaceAccountResponseSchema.parse(account);
  }

  @RequirePermissions("marketplace_integration.write")
  @Post(":id/activate")
  async activate(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarketplaceAccountResponseDto> {
    const account = await this.marketplaceIntegrationService.activateMarketplaceAccount(currentUser.companyId, id);
    return marketplaceAccountResponseSchema.parse(account);
  }

  @RequirePermissions("marketplace_integration.write")
  @Post(":id/deactivate")
  async deactivate(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarketplaceAccountResponseDto> {
    const account = await this.marketplaceIntegrationService.deactivateMarketplaceAccount(currentUser.companyId, id);
    return marketplaceAccountResponseSchema.parse(account);
  }
}
