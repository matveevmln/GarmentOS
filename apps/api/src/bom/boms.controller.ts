import { Body, Controller, Get, HttpStatus, NotFoundException, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  approveBomSchema,
  bomResponseSchema,
  createBomDraftSchema,
  getApprovedBomQuerySchema,
  type BomResponseDto,
} from "@garmentos/shared-types";
import { BomService } from "./bom.service";

class CreateBomDraftDto extends createZodDto(createBomDraftSchema) {}
class ApproveBomDto extends createZodDto(approveBomSchema) {}
class GetApprovedBomQueryDto extends createZodDto(getApprovedBomQuerySchema) {}

@ApiTags("boms")
@Controller("boms")
export class BomsController {
  constructor(private readonly bomService: BomService) {}

  @Post()
  async create(@Body() body: CreateBomDraftDto): Promise<BomResponseDto> {
    const bom = await this.bomService.createDraft(body);
    return bomResponseSchema.parse(bom);
  }

  @Post(":id/approve")
  async approve(@Param("id") id: string, @Body() body: ApproveBomDto): Promise<BomResponseDto> {
    const bom = await this.bomService.approve(body.companyId, id);
    return bomResponseSchema.parse(bom);
  }

  @Get("approved")
  async getApproved(@Query() query: GetApprovedBomQueryDto): Promise<BomResponseDto> {
    const bom = await this.bomService.getApproved(query);
    if (!bom) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "BOM_NOT_FOUND",
        message: "Утверждённый BOM для этой модели не найден",
      });
    }
    return bomResponseSchema.parse(bom);
  }
}
