import { DomainError } from "../domain/errors";
import { assertValidPrice, assertValidStock, type MarketplaceListing } from "../domain/marketplace-listing";
import type { MarketplaceListingRepository } from "./ports";

export interface UpdateListingDeps {
  marketplaceListings: MarketplaceListingRepository;
}

// companyId обязателен в обоих use case: listingId приходит из URL, и поиск
// карточки без ограничения по компании позволял бы менять цену/остаток в
// чужой компании (Step 4A.2).
export async function updateListingPrice(
  deps: UpdateListingDeps,
  input: { companyId: string; listingId: string; currentPrice: number },
): Promise<MarketplaceListing> {
  assertValidPrice(input.currentPrice);
  const listing = await deps.marketplaceListings.findById(input.companyId, input.listingId);
  if (!listing) {
    throw new DomainError(`Карточка маркетплейса ${input.listingId} не найдена`, "LISTING_NOT_FOUND");
  }
  return deps.marketplaceListings.updatePrice(listing.id, input.currentPrice);
}

export async function updateListingStock(
  deps: UpdateListingDeps,
  input: { companyId: string; listingId: string; currentStockReported: number },
): Promise<MarketplaceListing> {
  assertValidStock(input.currentStockReported);
  const listing = await deps.marketplaceListings.findById(input.companyId, input.listingId);
  if (!listing) {
    throw new DomainError(`Карточка маркетплейса ${input.listingId} не найдена`, "LISTING_NOT_FOUND");
  }
  return deps.marketplaceListings.updateStock(listing.id, input.currentStockReported);
}
