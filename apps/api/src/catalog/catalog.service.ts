import { Inject, Injectable } from "@nestjs/common";
import {
  addProductColor,
  createCollection,
  createProduct,
  createProductVariant,
  replaceProductSizes,
  updateProductCosts,
  type Collection,
  type CollectionRepository,
  type Product,
  type ProductRepository,
  type ProductSize,
  type ProductSizeRepository,
  type ProductVariant,
  type ProductVariantRepository,
} from "@garmentos/domain-catalog";
import type {
  AddProductColorDto,
  CreateCollectionDto,
  CreateProductDto,
  CreateProductVariantDto,
  ReplaceProductSizesDto,
  UpdateProductCostsDto,
} from "@garmentos/shared-types";
import {
  COLLECTION_REPOSITORY,
  PRODUCT_REPOSITORY,
  PRODUCT_SIZE_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
} from "./catalog.tokens";

// Тонкий presentation-адаптер поверх packages/domain/catalog (docs/ARCHITECTURE.md,
// раздел 2) — репозитории внедряются через DI по токенам доменных портов.
@Injectable()
export class CatalogService {
  constructor(
    @Inject(COLLECTION_REPOSITORY) private readonly collections: CollectionRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly productVariants: ProductVariantRepository,
    @Inject(PRODUCT_SIZE_REPOSITORY) private readonly productSizes: ProductSizeRepository,
  ) {}

  // Размерный ряд модели: порядок размеров и веса раскладки (владелец
  // проекта, 2026-08-30). Правка ряда не затрагивает уже созданные заказы —
  // их матрица живёт собственными строками.
  async listProductSizes(productId: string): Promise<ProductSize[]> {
    return this.productSizes.listByProduct(productId);
  }

  async replaceProductSizes(companyId: string, productId: string, input: ReplaceProductSizesDto): Promise<ProductSize[]> {
    return replaceProductSizes(
      { products: this.products, productSizes: this.productSizes },
      { companyId, productId, sizes: input.sizes },
    );
  }

  async addProductColor(
    companyId: string,
    productId: string,
    input: AddProductColorDto,
    createdBy: string | null,
  ): Promise<{ created: number; skipped: number }> {
    return addProductColor(
      { products: this.products, productSizes: this.productSizes, productVariants: this.productVariants },
      { companyId, productId, color: input.color, colorCode: input.colorCode, createdBy },
    );
  }

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
