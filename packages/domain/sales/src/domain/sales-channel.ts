import { DomainError } from "./errors";

export type SalesChannelType = "marketplace" | "wholesale" | "retail" | "own_website";

export interface SalesChannel {
  id: string;
  companyId: string;
  type: SalesChannelType;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export function assertValidSalesChannelName(name: string): void {
  if (name.trim().length === 0) {
    throw new DomainError("Название канала продаж не может быть пустым", "SALES_CHANNEL_NAME_REQUIRED");
  }
}
