import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductVariantSchema,
  listProductVariantsQuerySchema,
  productVariantResponseSchema,
  type ProductVariantResponseDto,
} from "@garmentos/shared-types";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CatalogService } from "./catalog.service";

class CreateProductVariantDto extends createZodDto(createProductVariantSchema) {}
class ListProductVariantsQueryDto extends createZodDto(listProductVariantsQuerySchema) {}

@ApiTags("product-variants")
@Controller("product-variants")
export class ProductVariantsController {
  constructor(private readonly catalogService: CatalogService) {}

  @RequirePermissions("catalog.write")
  @Post()
  async create(@Body() body: CreateProductVariantDto): Promise<ProductVariantResponseDto> {
    const productVariant = await this.catalogService.createProductVariant(body);
    return productVariantResponseSchema.parse(productVariant);
  }

  @RequirePermissions("catalog.read")
  @Get()
  async list(@Query() query: ListProductVariantsQueryDto): Promise<ProductVariantResponseDto[]> {
    const variants = await this.catalogService.listProductVariants(query.productId);
    return variants.map((variant) => productVariantResponseSchema.parse(variant));
  }
}
