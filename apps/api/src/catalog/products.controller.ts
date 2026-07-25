import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createProductSchema, productResponseSchema, type ProductResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CatalogService } from "./catalog.service";

class CreateProductDto extends createZodDto(createProductSchema) {}

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly catalogService: CatalogService) {}

  @RequirePermissions("catalog.write")
  @Post()
  async create(
    @Body() body: CreateProductDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductResponseDto> {
    const product = await this.catalogService.createProduct(currentUser.companyId, body);
    return productResponseSchema.parse(product);
  }
}
