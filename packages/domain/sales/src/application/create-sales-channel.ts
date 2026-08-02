import { assertValidSalesChannelName, type SalesChannel, type SalesChannelType } from "../domain/sales-channel";
import type { SalesChannelRepository } from "./ports";

export interface CreateSalesChannelInput {
  companyId: string;
  type: SalesChannelType;
  name: string;
}

export interface CreateSalesChannelDeps {
  salesChannels: SalesChannelRepository;
}

export async function createSalesChannel(
  deps: CreateSalesChannelDeps,
  input: CreateSalesChannelInput,
): Promise<SalesChannel> {
  const name = input.name.trim();
  assertValidSalesChannelName(name);

  return deps.salesChannels.create({ companyId: input.companyId, type: input.type, name });
}
