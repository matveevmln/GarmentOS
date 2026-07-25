import { Inject, Injectable } from "@nestjs/common";
import {
  createCollection,
  createProduct,
  createProductVariant,
  type Collection,
  type CollectionRepository,
  type Product,
  type ProductRepository,
  type ProductVariant,
  type ProductVariantRepository,
} from "@garmentos/domain-catalog";
import type { CreateCollectionDto, CreateProductDto, CreateProductVariantDto } from "@garmentos/shared-types";
import { COLLECTION_REPOSITORY, PRODUCT_REPOSITORY, PRODUCT_VARIANT_REPOSITORY } from "./catalog.tokens";

// Тонкий presentation-адаптер поверх packages/domain/catalog (docs/ARCHITECTURE.md,
// раздел 2) — репозитории внедряются через DI по токенам доменных портов.
@Injectable()
export class CatalogService {
  constructor(
    @Inject(COLLECTION_REPOSITORY) private readonly collections: CollectionRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly productVariants: ProductVariantRepository,
  ) {}

  async createCollection(companyId: string, input: CreateCollectionDto): Promise<Collection> {
    return createCollection({ collections: this.collections }, { ...input, companyId });
  }

  async createProduct(companyId: string, input: CreateProductDto): Promise<Product> {
    return createProduct({ products: this.products }, { ...input, companyId });
  }

  async createProductVariant(input: CreateProductVariantDto): Promise<ProductVariant> {
    return createProductVariant({ productVariants: this.productVariants }, input);
  }
}
