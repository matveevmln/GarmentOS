import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createMaterialSchema, materialResponseSchema, type MaterialResponseDto } from "@garmentos/shared-types";
import { ProcurementService } from "./procurement.service";

class CreateMaterialDto extends createZodDto(createMaterialSchema) {}

@ApiTags("materials")
@Controller("materials")
export class MaterialsController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Post()
  async create(@Body() body: CreateMaterialDto): Promise<MaterialResponseDto> {
    const material = await this.procurementService.createMaterial(body);
    return materialResponseSchema.parse(material);
  }
}
