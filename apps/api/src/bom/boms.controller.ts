import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  bomResponseSchema,
  createBomDraftSchema,
  getApprovedBomQuerySchema,
  type BomResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { BomService } from "./bom.service";

class CreateBomDraftDto extends createZodDto(createBomDraftSchema) {}
class GetApprovedBomQueryDto extends createZodDto(getApprovedBomQuerySchema) {}

@ApiTags("boms")
@Controller("boms")
export class BomsController {
  constructor(private readonly bomService: BomService) {}

  @RequirePermissions("bom.write")
  @Post()
  async create(
    @Body() body: CreateBomDraftDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<BomResponseDto> {
    const bom = await this.bomService.createDraft(currentUser.companyId, body);
    return bomResponseSchema.parse(bom);
  }

  // bom.approve — отдельное право от bom.write (docs/AUTH_ARCHITECTURE.md,
  // раздел 5) — единственный жёсткий кросс-модульный инвариант системы.
  @RequirePermissions("bom.approve")
  @Post(":id/approve")
  async approve(@Param("id") id: string, @CurrentUser() currentUser: AuthenticatedRequestUser): Promise<BomResponseDto> {
    const bom = await this.bomService.approve(currentUser.companyId, id);
    return bomResponseSchema.parse(bom);
  }

  @RequirePermissions("bom.read")
  @Get("approved")
  async getApproved(
    @Query() query: GetApprovedBomQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<BomResponseDto> {
    const bom = await this.bomService.getApproved(currentUser.companyId, query);
    if (!bom) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "BOM_NOT_FOUND",
        message: "Утверждённый BOM для этой модели не найден",
      });
    }
    return bomResponseSchema.parse(bom);
  }

  // Все версии BOM модели (draft/approved/archived), не только утверждённая
  // — apps/web (Итерация 11), чтобы можно было утвердить черновик из списка.
  @RequirePermissions("bom.read")
  @Get()
  async list(
    @Query() query: GetApprovedBomQueryDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<BomResponseDto[]> {
    const boms = await this.bomService.listByProduct(currentUser.companyId, query.productId);
    return boms.map((bom) => bomResponseSchema.parse(bom));
  }
}
