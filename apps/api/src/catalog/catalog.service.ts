import { createHash } from "node:crypto";
import { z } from "zod";
import { DatabaseTransaction } from "../database/database-transaction";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  addProductAttribute,
  addProductColor,
  createCollection,
  createProduct,
  createProductVariant,
  removeProductAttribute,
  replaceProductSizes,
  updateProductAttribute,
  updateProductCosts,
  updateProductDetails,
  type Collection,
  type CollectionRepository,
  type Product,
  type ProductAttribute,
  type ProductAttributeRepository,
  type ProductRepository,
  type ProductSize,
  type ProductSizeRepository,
  type ProductVariant,
  type ProductVariantRepository,
} from "@garmentos/domain-catalog";
import type {
  AddProductColorDto,
  QuickProductDto,
  CreateCollectionDto,
  CreateProductDto,
  CreateProductVariantDto,
  ProductAttributeDraftDto,
  ReplaceProductSizesDto,
  UpdateProductCostsDto,
  UpdateProductDetailsDto,
} from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import {
  COLLECTION_REPOSITORY,
  PRODUCT_ATTRIBUTE_REPOSITORY,
  PRODUCT_REPOSITORY,
  PRODUCT_SIZE_REPOSITORY,
  PRODUCT_VARIANT_REPOSITORY,
} from "./catalog.tokens";

function toProductAuditJson(product: Product): Record<string, unknown> {
  return {
    name: product.name,
    code: product.code,
    category: product.category,
    season: product.season,
    description: product.description,
    status: product.status,
    standardSewingCost: product.standardSewingCost,
    standardSewingCostCurrency: product.standardSewingCostCurrency,
    otherProductionCost: product.otherProductionCost,
    otherProductionCostCurrency: product.otherProductionCostCurrency,
  };
}

// Тонкий presentation-адаптер поверх packages/domain/catalog (docs/ARCHITECTURE.md,
// раздел 2) — репозитории внедряются через DI по токенам доменных портов.
//
// Аудит паспорта модели (Этап 2 — «Паспорт модели», владелец проекта,
// 2026-09-12, требование №6) — тот же паттерн, что updateWorkshop в
// ContractManufacturingService: методы, которые правят карточку модели,
// принимают currentUser (не голый companyId), потому что audit_log
// пишется отсюда же, сразу после успешной доменной операции.
@Injectable()
export class CatalogService {
  constructor(
    @Inject(COLLECTION_REPOSITORY) private readonly collections: CollectionRepository,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(PRODUCT_VARIANT_REPOSITORY) private readonly productVariants: ProductVariantRepository,
    @Inject(PRODUCT_SIZE_REPOSITORY) private readonly productSizes: ProductSizeRepository,
    @Inject(PRODUCT_ATTRIBUTE_REPOSITORY)
    private readonly productAttributes: ProductAttributeRepository,
    private readonly auditService: AuditService,
    private readonly transaction: DatabaseTransaction,
  ) {}

  async setProductStatus(
    user: AuthenticatedRequestUser,
    id: string,
    status: "active" | "discontinued",
  ): Promise<Product> {
    return this.transaction.run(user.companyId, "product", id, async () => {
      const before = await this.products.findById(user.companyId, id);
      if (!before || before.deletedAt) throw new NotFoundException("Модель не найдена");
      const product = await this.products.setStatus(user.companyId, id, status);
      await this.auditService.recordForUser(user, {
        entityType: "product",
        entityId: id,
        action: status === "discontinued" ? "product.archived" : "product.restored",
        beforeJson: { status: before.status },
        afterJson: { status: product.status },
      });
      return product;
    });
  }

  async quickProduct(user: AuthenticatedRequestUser, input: QuickProductDto): Promise<Product> {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    return this.transaction.run(user.companyId, "product_request", input.requestId, async () => {
      const previous = (
        await this.auditService.listForEntity(user.companyId, "product_request", input.requestId)
      ).find((entry) => entry.action === "product.request_completed");
      if (previous) {
        const saved = z
          .object({ productId: z.string().uuid(), hash: z.string() })
          .parse(previous.afterJson);
        if (previous.userId !== user.id || saved.hash !== hash)
          throw new ConflictException("Эта попытка уже сохранена с другими данными");
        const product = await this.findProductById(user.companyId, saved.productId);
        if (!product) throw new NotFoundException("Модель не найдена");
        return product;
      }
      const product = input.productId
        ? await this.findProductById(user.companyId, input.productId)
        : await this.createProduct(user, { name: input.name, code: `MODEL-${input.requestId}` });
      if (!product) throw new NotFoundException("Модель не найдена в вашей компании");
      if (product.deletedAt || product.status === "discontinued")
        throw new BadRequestException("Модель находится в архиве");
      return this.transaction.run(user.companyId, "product", product.id, async () => {
        await this.replaceProductSizes(user, product.id, { sizes: input.sizes });
        const oldVariants = await this.listProductVariants(user.companyId, product.id);
        for (const [index, color] of input.colors.entries()) {
          const existing = oldVariants.find((row) => row.color === color);
          const prefix = existing ? `${product.code}-${existing.size}-` : "";
          const colorCode = existing?.skuCode.startsWith(prefix)
            ? existing.skuCode.slice(prefix.length)
            : existing
              ? `C-${existing.id}`
              : `C-${input.requestId}-${index + 1}`;
          await this.addProductColor(user, product.id, { color, colorCode });
        }
        await this.auditService.recordForUser(user, {
          entityType: "product_request",
          entityId: input.requestId,
          action: "product.request_completed",
          afterJson: { productId: product.id, hash },
        });
        return product;
      });
    });
  }

  // Размерный ряд модели: порядок размеров и веса раскладки (владелец
  // проекта, 2026-08-30). Правка ряда не затрагивает уже созданные заказы —
  // их матрица живёт собственными строками.
  async listProductSizes(companyId: string, productId: string): Promise<ProductSize[]> {
    return this.productSizes.listByProduct(companyId, productId);
  }

  async replaceProductSizes(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    input: ReplaceProductSizesDto,
  ): Promise<ProductSize[]> {
    return this.transaction.run(currentUser.companyId, "product", productId, async () => {
      const before = await this.productSizes.listByProduct(currentUser.companyId, productId);
      const sizes = await replaceProductSizes(
        { products: this.products, productSizes: this.productSizes },
        { companyId: currentUser.companyId, productId, sizes: input.sizes },
      );
      await this.auditService.recordForUser(currentUser, {
        entityType: "product",
        entityId: productId,
        action: "product.sizes_replaced",
        beforeJson: before.map((row) => ({ size: row.size, ratioWeight: row.ratioWeight })),
        afterJson: sizes.map((row) => ({ size: row.size, ratioWeight: row.ratioWeight })),
      });
      const product = await this.products.findById(currentUser.companyId, productId);
      const variants = await this.productVariants.listByProduct(currentUser.companyId, productId);
      if (product) {
        for (const color of new Set(variants.map((row) => row.color))) {
          const existing = variants.find((row) => row.color === color)!;
          const prefix = `${product.code}-${existing.size}-`;
          const colorCode = existing.skuCode.startsWith(prefix)
            ? existing.skuCode.slice(prefix.length)
            : `C-${existing.id}`;
          await addProductColor(
            {
              products: this.products,
              productSizes: this.productSizes,
              productVariants: this.productVariants,
            },
            {
              companyId: currentUser.companyId,
              productId,
              color,
              colorCode,
              createdBy: currentUser.id,
            },
          );
        }
      }
      return sizes;
    });
  }

  async addProductColor(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    input: AddProductColorDto,
  ): Promise<{ created: number; skipped: number }> {
    return this.transaction.run(currentUser.companyId, "product", productId, async () => {
    const result = await addProductColor(
      {
        products: this.products,
        productSizes: this.productSizes,
        productVariants: this.productVariants,
      },
      {
        companyId: currentUser.companyId,
        productId,
        color: input.color,
        colorCode: input.colorCode,
        createdBy: currentUser.id,
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: productId,
      action: "product.color_added",
      afterJson: {
        color: input.color,
        colorCode: input.colorCode,
        created: result.created,
        skipped: result.skipped,
      },
    });
    return result;
    });
  }

  async createCollection(companyId: string, input: CreateCollectionDto): Promise<Collection> {
    return createCollection({ collections: this.collections }, { ...input, companyId });
  }

  async createProduct(
    currentUser: AuthenticatedRequestUser,
    input: CreateProductDto,
  ): Promise<Product> {
    const product = await createProduct(
      { products: this.products },
      { ...input, companyId: currentUser.companyId, createdBy: input.createdBy ?? currentUser.id },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: product.id,
      action: "product.created",
      afterJson: toProductAuditJson(product),
    });
    return product;
  }

  async createProductVariant(
    companyId: string,
    input: CreateProductVariantDto,
  ): Promise<ProductVariant> {
    return createProductVariant(
      { productVariants: this.productVariants, products: this.products },
      { ...input, companyId },
    );
  }

  async findProductById(companyId: string, id: string): Promise<Product | null> {
    return this.products.findById(companyId, id);
  }

  async updateProductCosts(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    input: UpdateProductCostsDto,
  ): Promise<Product> {
    const before = await this.products.findById(currentUser.companyId, productId);
    const product = await updateProductCosts(
      { products: this.products },
      { companyId: currentUser.companyId, productId, ...input },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: productId,
      action: "product.costs_updated",
      beforeJson: before ? toProductAuditJson(before) : null,
      afterJson: toProductAuditJson(product),
    });
    return product;
  }

  // Название/категория/описание паспорта модели — отдельно от себестоимости
  // выше (Этап 2 — «Паспорт модели»).
  async updateProductDetails(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    input: UpdateProductDetailsDto,
  ): Promise<Product> {
    const before = await this.products.findById(currentUser.companyId, productId);
    const product = await updateProductDetails(
      { products: this.products },
      { companyId: currentUser.companyId, productId, ...input },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: productId,
      action: "product.details_updated",
      beforeJson: before ? toProductAuditJson(before) : null,
      afterJson: toProductAuditJson(product),
    });
    return product;
  }

  async findProductByName(companyId: string, name: string): Promise<Product | null> {
    return this.products.findByName(companyId, name);
  }

  async listProducts(companyId: string): Promise<Product[]> {
    return this.products.listByCompany(companyId);
  }

  // companyId во всех трёх методах — обязательный: SKU принадлежит компании
  // через свою модель (products.company_id), и без этого параметра запрос по
  // одному UUID вернул бы чужой SKU (Step 4A.2).
  async findProductVariant(
    companyId: string,
    productId: string,
    size: string,
    color: string,
  ): Promise<ProductVariant | null> {
    return this.productVariants.findByProductSizeColor(companyId, productId, size, color);
  }

  async listProductVariants(companyId: string, productId: string): Promise<ProductVariant[]> {
    return this.productVariants.listByProduct(companyId, productId);
  }

  // Автозаполнение полей «Цвет»/характеристики уже встречавшимися у компании
  // значениями (владелец проекта, 2026-09-21) — снимает ручной повторный ввод
  // одного и того же текста для каждой новой модели.
  async listCompanyColors(companyId: string): Promise<string[]> {
    return this.productVariants.listDistinctColorsByCompany(companyId);
  }

  async listCompanyAttributePresets(
    companyId: string,
  ): Promise<Array<{ name: string; value: string }>> {
    return this.productAttributes.listDistinctByCompany(companyId);
  }

  async findProductVariantById(companyId: string, id: string): Promise<ProductVariant | null> {
    return this.productVariants.findById(companyId, id);
  }

  async findSimilarProductNames(companyId: string, name: string, limit = 3): Promise<string[]> {
    const matches = await this.products.findSimilarByName(companyId, name, limit);
    return matches.map((product) => product.name);
  }

  // Характеристики паспорта модели (Этап 2, требование №3): «Состав»,
  // «Плотность» и т.п. — растут по одной строке, не заменяются целиком.
  async listProductAttributes(companyId: string, productId: string): Promise<ProductAttribute[]> {
    return this.productAttributes.listByProduct(companyId, productId);
  }

  async addProductAttribute(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    input: ProductAttributeDraftDto,
  ): Promise<ProductAttribute> {
    const attribute = await addProductAttribute(
      { products: this.products, productAttributes: this.productAttributes },
      { companyId: currentUser.companyId, productId, name: input.name, value: input.value },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: productId,
      action: "product.attribute_added",
      afterJson: { name: attribute.name, value: attribute.value },
    });
    return attribute;
  }

  async updateProductAttribute(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    attributeId: string,
    input: ProductAttributeDraftDto,
  ): Promise<ProductAttribute> {
    const before = await this.productAttributes.findById(productId, attributeId);
    const attribute = await updateProductAttribute(
      { products: this.products, productAttributes: this.productAttributes },
      {
        companyId: currentUser.companyId,
        productId,
        attributeId,
        name: input.name,
        value: input.value,
      },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: productId,
      action: "product.attribute_updated",
      beforeJson: before ? { name: before.name, value: before.value } : null,
      afterJson: { name: attribute.name, value: attribute.value },
    });
    return attribute;
  }

  async removeProductAttribute(
    currentUser: AuthenticatedRequestUser,
    productId: string,
    attributeId: string,
  ): Promise<void> {
    const before = await this.productAttributes.findById(productId, attributeId);
    await removeProductAttribute(
      { products: this.products, productAttributes: this.productAttributes },
      { companyId: currentUser.companyId, productId, attributeId },
    );
    await this.auditService.recordForUser(currentUser, {
      entityType: "product",
      entityId: productId,
      action: "product.attribute_removed",
      beforeJson: before ? { name: before.name, value: before.value } : null,
    });
  }
}
