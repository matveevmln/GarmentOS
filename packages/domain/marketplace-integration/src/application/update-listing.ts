import { DomainError } from "../domain/errors";
import { assertValidPrice, assertValidStock, type MarketplaceListing } from "../domain/marketplace-listing";
import type { MarketplaceListingRepository } from "./ports";

export interface UpdateListingDeps {
  marketplaceListings: MarketplaceListingRepository;
}

export async function updateListingPrice(
  deps: UpdateListingDeps,
  input: { listingId: string; currentPrice: number },
): Promise<MarketplaceListing> {
  assertValidPrice(input.currentPrice);
  const listing = await deps.marketplaceListings.findById(input.listingId);
  if (!listing) {
    throw new DomainError(`Карточка маркетплейса ${input.listingId} не найдена`, "LISTING_NOT_FOUND");
  }
  return deps.marketplaceListings.updatePrice(listing.id, input.currentPrice);
}

export async function updateListingStock(
  deps: UpdateListingDeps,
  input: { listingId: string; currentStockReported: number },
): Promise<MarketplaceListing> {
  assertValidStock(input.currentStockReported);
  const listing = await deps.marketplaceListings.findById(input.listingId);
  if (!listing) {
    throw new DomainError(`Карточка маркетплейса ${input.listingId} не найдена`, "LISTING_NOT_FOUND");
  }
  return deps.marketplaceListings.updateStock(listing.id, input.currentStockReported);
}
