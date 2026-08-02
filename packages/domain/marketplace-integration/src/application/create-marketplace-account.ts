import { DomainError } from "../domain/errors";
import { assertValidCredentials, type MarketplaceAccount } from "../domain/marketplace-account";
import type { MarketplaceCode } from "../domain/marketplace";
import type { MarketplaceAccountRepository, MarketplaceRepository } from "./ports";

export interface CreateMarketplaceAccountInput {
  companyId: string;
  marketplaceCode: MarketplaceCode;
  apiCredentialsEncrypted: string;
}

export interface CreateMarketplaceAccountDeps {
  marketplaceAccounts: MarketplaceAccountRepository;
  marketplaces: MarketplaceRepository;
}

export async function createMarketplaceAccount(
  deps: CreateMarketplaceAccountDeps,
  input: CreateMarketplaceAccountInput,
): Promise<MarketplaceAccount> {
  assertValidCredentials(input.apiCredentialsEncrypted);

  const marketplace = await deps.marketplaces.findByCode(input.marketplaceCode);
  if (!marketplace) {
    throw new DomainError(
      `Маркетплейс "${input.marketplaceCode}" не зарегистрирован в справочнике (ensureMarketplace)`,
      "MARKETPLACE_NOT_FOUND",
    );
  }

  return deps.marketplaceAccounts.create({
    companyId: input.companyId,
    marketplaceId: marketplace.id,
    apiCredentialsEncrypted: input.apiCredentialsEncrypted,
  });
}
