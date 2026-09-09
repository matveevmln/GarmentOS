import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductVariantSchema,
  listProductVariantsQuerySchema,
  productVariantResponseSchema,
  type ProductVariantResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CatalogService } from "./catalog.service";

class CreateProductVariantDto extends createZodDto(createProductVariantSchema) {}
class ListProductVariantsQueryDto extends createZodDto(listProductVariantsQuerySchema) {}

@ApiTags("product-variants")
@Controller("product-variants")
export class ProductVariantsController {
  constructor(private readonly catalogService: CatalogService) {}

  // productId приходит из тела/query запроса, поэтому companyId берётся из
  // токена (@CurrentUser) и проверяется в доменном use case — иначе по
  // чужому productId можно было бы создать и прочитать SKU другой компании.
  @RequirePermissions("catalog.write")
  @Post()
  async create(
    @Body() body: CreateProductVariantDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductVariantResponseDto> {
    const productVariant = await this.catalogService.createProductVariant(currentUser.companyId, body);
    return productVariantResponseSchema.parse(productVariant);
  }

  @RequirePermissions("catalog.read")
  @Get()
  async list(
    @Query() query: ListProductVariantsQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductVariantResponseDto[]> {
    const variants = await this.catalogService.listProductVariants(currentUser.companyId, query.productId);
    return variants.map((variant) => productVariantResponseSchema.parse(variant));
  }
}
