import { assertValidProductCode, assertValidProductName, type Product } from "../domain/product";
import { DomainError } from "../domain/errors";
import type { ProductRepository } from "./ports";

export interface CreateProductInput {
  companyId: string;
  collectionId?: string;
  name: string;
  code: string;
  category?: string;
  season?: string;
  createdBy?: string;
}

export interface CreateProductDeps {
  products: ProductRepository;
}

export async function createProduct(deps: CreateProductDeps, input: CreateProductInput): Promise<Product> {
  const name = input.name.trim();
  const code = input.code.trim();
  assertValidProductName(name);
  assertValidProductCode(code);

  const existing = await deps.products.findByCode(input.companyId, code);
  if (existing) {
    throw new DomainError(`Модель с артикулом "${code}" уже существует`, "PRODUCT_CODE_TAKEN");
  }

  return deps.products.create({
    companyId: input.companyId,
    collectionId: input.collectionId ?? null,
    name,
    code,
    category: input.category ?? null,
    season: input.season ?? null,
    status: "draft",
    createdBy: input.createdBy ?? null,
  });
}
