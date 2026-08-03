import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createProductSchema,
  findProductByNameQuerySchema,
  productResponseSchema,
  updateProductCostsSchema,
  type ProductResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { CatalogService } from "./catalog.service";

class CreateProductDto extends createZodDto(createProductSchema) {}
class FindProductByNameQueryDto extends createZodDto(findProductByNameQuerySchema) {}
class UpdateProductCostsDto extends createZodDto(updateProductCostsSchema) {}

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

  // Без ?name= — список всех моделей компании (apps/web, Итерация 11).
  // С ?name= — точный поиск для разбора текстового производственного запроса
  // (Итерация 7): AI извлекает название модели из текста, этот эндпоинт
  // резолвит его в реальный productId (или явно сообщает, что модель не
  // найдена — не придумывается).
  @RequirePermissions("catalog.read")
  @Get()
  async findByName(
    @Query() query: FindProductByNameQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductResponseDto | ProductResponseDto[]> {
    if (!query.name) {
      const products = await this.catalogService.listProducts(currentUser.companyId);
      return products.map((product) => productResponseSchema.parse(product));
    }

    const product = await this.catalogService.findProductByName(currentUser.companyId, query.name);
    if (!product) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "PRODUCT_NOT_FOUND",
        message: `Модель "${query.name}" не найдена в каталоге`,
      });
    }
    return productResponseSchema.parse(product);
  }

  // «Расчёт стоимости спецификации» (владелец проекта, 2026-08-03) читает
  // эти два поля вместе с BOM — редактируются отдельно от остальных полей
  // модели, не через общий PATCH/PUT.
  @RequirePermissions("catalog.write")
  @Patch(":id/costs")
  async updateCosts(
    @Param("id") id: string,
    @Body() body: UpdateProductCostsDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductResponseDto> {
    const product = await this.catalogService.updateProductCosts(currentUser.companyId, id, body);
    return productResponseSchema.parse(product);
  }

  @RequirePermissions("catalog.read")
  @Get(":id")
  async findById(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductResponseDto> {
    const product = await this.catalogService.findProductById(currentUser.companyId, id);
    if (!product) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "PRODUCT_NOT_FOUND",
        message: `Модель ${id} не найдена`,
      });
    }
    return productResponseSchema.parse(product);
  }
}
