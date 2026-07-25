import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createSupplierSchema, supplierResponseSchema, type SupplierResponseDto } from "@garmentos/shared-types";
import { ProcurementService } from "./procurement.service";

class CreateSupplierDto extends createZodDto(createSupplierSchema) {}

@ApiTags("suppliers")
@Controller("suppliers")
export class SuppliersController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Post()
  async create(@Body() body: CreateSupplierDto): Promise<SupplierResponseDto> {
    const supplier = await this.procurementService.createSupplier(body);
    return supplierResponseSchema.parse(supplier);
  }
}
