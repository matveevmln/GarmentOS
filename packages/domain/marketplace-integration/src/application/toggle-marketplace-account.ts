import { DomainError } from "../domain/errors";
import type { MarketplaceAccount } from "../domain/marketplace-account";
import type { MarketplaceAccountRepository } from "./ports";

export interface ToggleMarketplaceAccountInput {
  companyId: string;
  marketplaceAccountId: string;
}

export interface ToggleMarketplaceAccountDeps {
  marketplaceAccounts: MarketplaceAccountRepository;
}

async function setActive(
  deps: ToggleMarketplaceAccountDeps,
  input: ToggleMarketplaceAccountInput,
  isActive: boolean,
): Promise<MarketplaceAccount> {
  const account = await deps.marketplaceAccounts.findById(input.companyId, input.marketplaceAccountId);
  if (!account) {
    throw new DomainError(
      `Личный кабинет ${input.marketplaceAccountId} не найден в этой компании`,
      "MARKETPLACE_ACCOUNT_NOT_FOUND",
    );
  }

  return deps.marketplaceAccounts.setActive(account.id, isActive);
}

export const deactivateMarketplaceAccount = (deps: ToggleMarketplaceAccountDeps, input: ToggleMarketplaceAccountInput) =>
  setActive(deps, input, false);

export const activateMarketplaceAccount = (deps: ToggleMarketplaceAccountDeps, input: ToggleMarketplaceAccountInput) =>
  setActive(deps, input, true);
