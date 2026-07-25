import { DomainError } from "../domain/errors";
import {
  assertValidExternalSkuId,
  assertValidPrice,
  assertValidStock,
  type MarketplaceListing,
} from "../domain/marketplace-listing";
import type { MarketplaceAccountRepository, MarketplaceListingRepository } from "./ports";

export interface CreateMarketplaceListingInput {
  companyId: string;
  marketplaceAccountId: string;
  productVariantId: string;
  externalSkuId: string;
  currentPrice?: number;
  currentStockReported?: number;
}

export interface CreateMarketplaceListingDeps {
  marketplaceListings: MarketplaceListingRepository;
  marketplaceAccounts: MarketplaceAccountRepository;
}

export async function createMarketplaceListing(
  deps: CreateMarketplaceListingDeps,
  input: CreateMarketplaceListingInput,
): Promise<MarketplaceListing> {
  const externalSkuId = input.externalSkuId.trim();
  assertValidExternalSkuId(externalSkuId);
  if (input.currentPrice !== undefined) assertValidPrice(input.currentPrice);
  if (input.currentStockReported !== undefined) assertValidStock(input.currentStockReported);

  const account = await deps.marketplaceAccounts.findById(input.companyId, input.marketplaceAccountId);
  if (!account) {
    throw new DomainError(
      `Личный кабинет ${input.marketplaceAccountId} не найден в этой компании`,
      "MARKETPLACE_ACCOUNT_NOT_FOUND",
    );
  }

  const duplicate = await deps.marketplaceListings.findByAccountAndExternalSkuId(input.marketplaceAccountId, externalSkuId);
  if (duplicate) {
    throw new DomainError(
      `Карточка с external SKU "${externalSkuId}" уже существует для этого личного кабинета`,
      "LISTING_EXTERNAL_SKU_ID_TAKEN",
    );
  }

  return deps.marketplaceListings.create({
    marketplaceAccountId: input.marketplaceAccountId,
    productVariantId: input.productVariantId,
    externalSkuId,
    currentPrice: input.currentPrice ?? null,
    currentStockReported: input.currentStockReported ?? null,
  });
}
