import type { Company } from "../domain/company";
import type { User } from "../domain/user";

export interface NewCompanyInput {
  name: string;
  legalName: string | null;
  inn: string | null;
  timezone: string;
  defaultCurrency: string;
}

export interface CompanyRepository {
  create(input: NewCompanyInput): Promise<Company>;
}

export interface NewUserInput {
  companyId: string;
  email: string;
  passwordHash: string;
  fullName: string;
}

export interface UserRepository {
  create(input: NewUserInput): Promise<User>;
  findByEmail(companyId: string, email: string): Promise<User | null>;
}
