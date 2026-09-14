import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { productProductionResponseSchema, type ProductProductionResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProductProductionService } from "./product-production.service";

// «История производства модели» — тот же URL-префикс "products", что и у
// ProductsController (catalog): один ресурс обслуживается двумя
// контроллерами в двух модулях (CRUD карточки модели / read-модель истории
// производства), без циклических импортов между модулями — тот же принцип,
// что у BatchPassportController поверх "production-orders".
@ApiTags("reporting")
@Controller("products")
export class ProductProductionController {
  constructor(private readonly productProductionService: ProductProductionService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get(":id/production")
  async getProduction(
    @Param("id") id: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductProductionResponseDto> {
    const production = await this.productProductionService.getProduction(currentUser.companyId, id);
    return productProductionResponseSchema.parse(production);
  }
}
