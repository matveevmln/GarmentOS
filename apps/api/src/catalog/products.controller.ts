import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createProductSchema, productResponseSchema, type ProductResponseDto } from "@garmentos/shared-types";
import { CatalogService } from "./catalog.service";

class CreateProductDto extends createZodDto(createProductSchema) {}

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  async create(@Body() body: CreateProductDto): Promise<ProductResponseDto> {
    const product = await this.catalogService.createProduct(body);
    return productResponseSchema.parse(product);
  }
}
