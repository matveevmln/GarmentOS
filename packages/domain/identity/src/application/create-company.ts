import { assertValidCompanyName, type Company } from "../domain/company";
import type { CompanyRepository } from "./ports";

export interface CreateCompanyInput {
  name: string;
  legalName?: string;
  inn?: string;
  timezone?: string;
  defaultCurrency?: string;
}

export interface CreateCompanyDeps {
  companies: CompanyRepository;
}

// Use case — единственная точка входа для создания компании, вызывается
// одинаково человеком (будущий apps/api) и AI (Inbox), см. PRINCIPLES.md
// принцип 15 (AI-First: один и тот же application service для обоих).
export async function createCompany(deps: CreateCompanyDeps, input: CreateCompanyInput): Promise<Company> {
  const name = input.name.trim();
  assertValidCompanyName(name);

  return deps.companies.create({
    name,
    legalName: input.legalName?.trim() ?? null,
    inn: input.inn?.trim() ?? null,
    timezone: input.timezone ?? "UTC",
    defaultCurrency: input.defaultCurrency ?? "RUB",
  });
}
