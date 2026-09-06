import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import { qcResultResponseSchema, recordQcResultSchema, type QcResultResponseDto } from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { QcService } from "./qc.service";

class RecordQcResultDto extends createZodDto(recordQcResultSchema) {}

// ОТК живёт внутри партии, поэтому оба маршрута висят на префиксе заказа —
// тот же принцип, что у раскроя. Права — существующие contract_manufacturing.*
// (владелец проекта, 2026-09-06: отдельное разрешение не заводить).
@ApiTags("qc")
@Controller("production-orders/:id/qc")
export class QcController {
  constructor(private readonly qcService: QcService) {}

  @RequirePermissions("contract_manufacturing.write")
  @Post()
  async record(
    @Param("id") productionOrderId: string,
    @Body() body: RecordQcResultDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<QcResultResponseDto> {
    const result = await this.qcService.record(currentUser, productionOrderId, body);
    return qcResultResponseSchema.parse(result);
  }

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async findByProductionOrder(
    @Param("id") productionOrderId: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<QcResultResponseDto> {
    const result = await this.qcService.findByProductionOrder(currentUser.companyId, productionOrderId);
    return qcResultResponseSchema.parse(result);
  }
}
