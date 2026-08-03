import { Inject, Injectable } from "@nestjs/common";
import {
  createCollection,
  createProduct,
  createProductVariant,
  updateProductCosts,
  type Collection,
  type CollectionRepository,
  type Product,
  type ProductRepository,
  type ProductVariant,
  type ProductVariantRepository,
} from "@garmentos/domain-catalog";
import type {
  CreateCollectionDto,
  CreateProductDto,
  CreateProductVariantDto,
  UpdateProductCostsDto,
} from "@garmentos/shared-types";
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

  async findProductById(companyId: string, id: string): Promise<Product | null> {
    return this.products.findById(companyId, id);
  }

  async updateProductCosts(companyId: string, productId: string, input: UpdateProductCostsDto): Promise<Product> {
    return updateProductCosts({ products: this.products }, { companyId, productId, ...input });
  }

  async findProductByName(companyId: string, name: string): Promise<Product | null> {
    return this.products.findByName(companyId, name);
  }

  async listProducts(companyId: string): Promise<Product[]> {
    return this.products.listByCompany(companyId);
  }

  async findProductVariant(productId: string, size: string, color: string): Promise<ProductVariant | null> {
    return this.productVariants.findByProductSizeColor(productId, size, color);
  }

  async listProductVariants(productId: string): Promise<ProductVariant[]> {
    return this.productVariants.listByProduct(productId);
  }

  async findProductVariantById(id: string): Promise<ProductVariant | null> {
    return this.productVariants.findById(id);
  }

  async findSimilarProductNames(companyId: string, name: string, limit = 3): Promise<string[]> {
    const matches = await this.products.findSimilarByName(companyId, name, limit);
    return matches.map((product) => product.name);
  }
}
