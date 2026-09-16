import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { createZodDto } from "nestjs-zod";
import {
  createDefectCompensationSchema,
  defectCompensationResponseSchema,
  productionOrderDefectResponseSchema,
  productionOrderDefectSummaryResponseSchema,
  type DefectCompensationResponseDto,
  type ProductionOrderDefectResponseDto,
  type ProductionOrderDefectSummaryResponseDto,
} from "@garmentos/shared-types";
import { CurrentUser, type AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { RequirePermissions } from "../auth/require-permissions.decorator";
import { DefectService } from "./defect.service";

class CreateDefectCompensationDto extends createZodDto(createDefectCompensationSchema) {}

// Брак живёт внутри партии (тот же принцип, что ОТК/раскрой) — списки и
// сводка висят на префиксе заказа. Права — существующие
// contract_manufacturing.* (владелец проекта, этап B: отдельное разрешение
// не заводить).
@ApiTags("defects")
@Controller("production-orders/:id/defects")
export class DefectController {
  constructor(private readonly defectService: DefectService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async listByProductionOrder(
    @Param("id") productionOrderId: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderDefectResponseDto[]> {
    const rows = await this.defectService.listByProductionOrder(currentUser.companyId, productionOrderId);
    return rows.map((row) => productionOrderDefectResponseSchema.parse(row));
  }
}

// Сводка "Произведено / Брак / Компенсировано / Осталось" — отдельный
// контроллер на соседнем префиксе того же заказа (не вложен в /defects,
// т.к. это агрегат по заказу, не список строк брака).
@ApiTags("defects")
@Controller("production-orders/:id/defect-summary")
export class DefectSummaryController {
  constructor(private readonly defectService: DefectService) {}

  @RequirePermissions("contract_manufacturing.read")
  @Get()
  async getSummary(
    @Param("id") productionOrderId: string,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<ProductionOrderDefectSummaryResponseDto> {
    const summary = await this.defectService.getSummary(currentUser.companyId, productionOrderId);
    return productionOrderDefectSummaryResponseSchema.parse(summary);
  }
}

// Создание компенсации — единственное действие модуля, требующее явного
// подтверждения пользователем (владелец проекта, п.3): "Добавить компенсацию".
@ApiTags("defects")
@Controller("defects/:defectId/compensations")
export class DefectCompensationController {
  constructor(private readonly defectService: DefectService) {}

  @RequirePermissions("contract_manufacturing.write")
  @Post()
  async create(
    @Param("defectId") defectId: string,
    @Body() body: CreateDefectCompensationDto,
    @CurrentUser() currentUser: AuthenticatedRequestUser,
  ): Promise<DefectCompensationResponseDto> {
    const compensation = await this.defectService.createCompensation(currentUser, defectId, body);
    return defectCompensationResponseSchema.parse(compensation);
  }
}
