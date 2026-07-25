import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductVariantSchema,
  productVariantResponseSchema,
  type ProductVariantResponseDto,
} from "@garmentos/shared-types";
import { CatalogService } from "./catalog.service";

class CreateProductVariantDto extends createZodDto(createProductVariantSchema) {}

@ApiTags("product-variants")
@Controller("product-variants")
export class ProductVariantsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  async create(@Body() body: CreateProductVariantDto): Promise<ProductVariantResponseDto> {
    const productVariant = await this.catalogService.createProductVariant(body);
    return productVariantResponseSchema.parse(productVariant);
  }
}
