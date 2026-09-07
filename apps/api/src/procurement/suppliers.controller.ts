import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createSupplierSchema, supplierResponseSchema, type SupplierResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProcurementService } from "./procurement.service";

class CreateSupplierDto extends createZodDto(createSupplierSchema) {}

@ApiTags("suppliers")
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly procurementService: ProcurementService) {}

  @RequirePermissions("procurement.write")
  @Post()
  async create(
    @Body() body: CreateSupplierDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<SupplierResponseDto> {
    const supplier = await this.procurementService.createSupplier(currentUser.companyId, body);
    return supplierResponseSchema.parse(supplier);
  }

  @RequirePermissions("procurement.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<SupplierResponseDto[]> {
    const suppliers = await this.procurementService.listSuppliers(currentUser.companyId);
    return suppliers.map((supplier) => supplierResponseSchema.parse(supplier));
  }
}
