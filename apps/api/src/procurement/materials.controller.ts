import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { createMaterialSchema, materialResponseSchema, type MaterialResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { ProcurementService } from "./procurement.service";

class CreateMaterialDto extends createZodDto(createMaterialSchema) {}

@ApiTags("materials")
@Controller("materials")
export class MaterialsController {
  constructor(private readonly procurementService: ProcurementService) {}

  @RequirePermissions("procurement.write")
  @Post()
  async create(
    @Body() body: CreateMaterialDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<MaterialResponseDto> {
    const material = await this.procurementService.createMaterial(currentUser.companyId, body);
    return materialResponseSchema.parse(material);
  }

  @RequirePermissions("procurement.read")
  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser): Promise<MaterialResponseDto[]> {
    const materials = await this.procurementService.listMaterials(currentUser.companyId);
    return materials.map((material) => materialResponseSchema.parse(material));
  }
}
