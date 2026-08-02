import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createMarketplaceListingSchema,
  marketplaceListingResponseSchema,
  updateListingPriceSchema,
  updateListingStockSchema,
  type MarketplaceListingResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { MarketplaceIntegrationService } from "./marketplace-integration.service";

class CreateMarketplaceListingDto extends createZodDto(createMarketplaceListingSchema) {}
class UpdateListingPriceDto extends createZodDto(updateListingPriceSchema) {}
class UpdateListingStockDto extends createZodDto(updateListingStockSchema) {}

@ApiTags("marketplace-listings")
@Controller("marketplace-listings")
export class MarketplaceListingsController {
  constructor(private readonly marketplaceIntegrationService: MarketplaceIntegrationService) {}

  @RequirePermissions("marketplace_integration.write")
  @Post()
  async create(
    @Body() body: CreateMarketplaceListingDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MarketplaceListingResponseDto> {
    const listing = await this.marketplaceIntegrationService.createMarketplaceListing(currentUser.companyId, body);
    return marketplaceListingResponseSchema.parse(listing);
  }

  @RequirePermissions("marketplace_integration.write")
  @Post(":id/price")
  async updatePrice(
    @Param("id") id: string,
    @Body() body: UpdateListingPriceDto,
  ): Promise<MarketplaceListingResponseDto> {
    const listing = await this.marketplaceIntegrationService.updateListingPrice(id, body);
    return marketplaceListingResponseSchema.parse(listing);
  }

  @RequirePermissions("marketplace_integration.write")
  @Post(":id/stock")
  async updateStock(
    @Param("id") id: string,
    @Body() body: UpdateListingStockDto,
  ): Promise<MarketplaceListingResponseDto> {
    const listing = await this.marketplaceIntegrationService.updateListingStock(id, body);
    return marketplaceListingResponseSchema.parse(listing);
  }
}
