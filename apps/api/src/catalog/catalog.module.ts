import { Module } from "@nestjs/common";
import type { Database } from "@garmentos/db-schema";
import {
  DrizzleCollectionRepository,
  DrizzleProductRepository,
  DrizzleProductVariantRepository,
} from "@garmentos/domain-catalog";
import { DATABASE_CONNECTION } from "../database/database.module";
import { CollectionsController } from "./collections.controller";
import { ProductsController } from "./products.controller";
import { ProductVariantsController } from "./product-variants.controller";
import { COLLECTION_REPOSITORY, PRODUCT_REPOSITORY, PRODUCT_VARIANT_REPOSITORY } from "./catalog.tokens";
import { CatalogService } from "./catalog.service";

@Module({
  controllers: [CollectionsController, ProductsController, ProductVariantsController],
  providers: [
    CatalogService,
    {
      provide: COLLECTION_REPOSITORY,
      useFactory: (db: Database) => new DrizzleCollectionRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: PRODUCT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleProductRepository(db),
      inject: [DATABASE_CONNECTION],
    },
    {
      provide: PRODUCT_VARIANT_REPOSITORY,
      useFactory: (db: Database) => new DrizzleProductVariantRepository(db),
      inject: [DATABASE_CONNECTION],
    },
  ],
})
export class CatalogModule {}
