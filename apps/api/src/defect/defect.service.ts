import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  createDefectCompensation,
  recordDefects,
  validateDefectDrafts,
  type DefectCompensation,
  type DefectCompensationRepository,
  type ProductionOrderDefect,
  type ProductionOrderDefectDraft,
  type ProductionOrderDefectRepository,
  type ProductionOrderLookupPort,
} from "@garmentos/domain-defect";
import type {
  CreateDefectCompensationDto,
  ProductionOrderDefectResponseDto,
  ProductionOrderDefectSummaryResponseDto,
  DefectCompensationResponseDto,
} from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DEFECT_COMPENSATION_REPOSITORY, DEFECT_PRODUCTION_ORDER_PORT, DEFECT_REPOSITORY } from "./defect.tokens";

// Тонкий presentation-адаптер поверх packages/domain/defect, тот же паттерн,
// что QcService поверх packages/domain/qc.
@Injectable()
export class DefectService {
  constructor(
    @Inject(DEFECT_REPOSITORY) private readonly defects: ProductionOrderDefectRepository,
    @Inject(DEFECT_COMPENSATION_REPOSITORY) private readonly compensations: DefectCompensationRepository,
    @Inject(DEFECT_PRODUCTION_ORDER_PORT) private readonly productionOrders: ProductionOrderLookupPort,
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly auditService: AuditService,
  ) {}

  private buildDrafts(totalDefectQuantity: number, breakdown: ProductionOrderDefectDraft[] | undefined): ProductionOrderDefectDraft[] {
    return breakdown && breakdown.length > 0
      ? breakdown
      : [{ productVariantId: null, quantity: totalDefectQuantity, reason: null }];
  }

  // Вызывается QcService ДО recordQcResult (владелец проекта, этап B):
  // невалидная разбивка брака не должна оставлять в БД результат ОТК без
  // возможности его исправить (результат ОТК — ровно один финальный на
  // заказ, второй попытки не будет). Ничего не пишет, только проверяет.
  async validateBreakdownForQc(
    companyId: string,
    productionOrderId: string,
    totalDefectQuantity: number,
    breakdown: ProductionOrderDefectDraft[] | undefined,
  ): Promise<void> {
    await validateDefectDrafts(
      { productionOrders: this.productionOrders },
      {
        companyId,
        productionOrderId,
        totalDefectQuantity,
        drafts: this.buildDrafts(totalDefectQuantity, breakdown),
      },
    );
  }

  // Вызывается QcService сразу после recordQcResult, когда defectQuantity > 0
  // (владелец проекта, этап B): без явной разбивки — одна агрегатная строка
  // на всё количество (Zero Input по умолчанию); с разбивкой — по строкам.
  // Публичного REST-эндпоинта "создать дефект" намеренно нет — единственный
  // источник дефекта — результат ОТК.
  async recordDefectsForQcResult(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    qcResultId: string,
    totalDefectQuantity: number,
    breakdown: ProductionOrderDefectDraft[] | undefined,
  ): Promise<ProductionOrderDefect[]> {
    const drafts = this.buildDrafts(totalDefectQuantity, breakdown);

    const created = await recordDefects(
      { defects: this.defects, productionOrders: this.productionOrders },
      {
        companyId: currentUser.companyId,
        productionOrderId,
        qcResultId,
        totalDefectQuantity,
        drafts,
        createdBy: currentUser.id,
      },
    );

    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: productionOrderId,
      action: "production_order.defect_recorded",
      afterJson: { qcResultId, totalDefectQuantity, rows: created.length },
    });

    return created;
  }

  async listByProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrderDefectResponseDto[]> {
    const rows = await this.defects.listByProductionOrder(companyId, productionOrderId);
    if (rows.length === 0) return [];
    const compensationRows = await this.compensations.listByDefectIds(
      companyId,
      rows.map((row) => row.id),
    );
    const compensatedByDefect = new Map<string, number>();
    for (const compensation of compensationRows) {
      compensatedByDefect.set(
        compensation.defectId,
        (compensatedByDefect.get(compensation.defectId) ?? 0) + Number(compensation.quantity),
      );
    }
    return rows.map((row) => this.toDefectResponse(row, compensatedByDefect.get(row.id) ?? 0));
  }

  async getSummary(companyId: string, productionOrderId: string): Promise<ProductionOrderDefectSummaryResponseDto> {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    if (!order) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "PRODUCTION_ORDER_NOT_FOUND",
        message: `Заказ пошива ${productionOrderId} не найден`,
      });
    }
    const rows = await this.defects.listByProductionOrder(companyId, productionOrderId);
    const defectQuantity = rows.reduce((sum, row) => sum + Number(row.quantity), 0);
    const compensationRows =
      rows.length === 0
        ? []
        : await this.compensations.listByDefectIds(
            companyId,
            rows.map((row) => row.id),
          );
    const compensatedQuantity = compensationRows.reduce((sum, row) => sum + Number(row.quantity), 0);
    return {
      producedQuantity: Number(order.plannedQuantity),
      defectQuantity,
      compensatedQuantity,
      remainingToCompensate: Math.max(0, defectQuantity - compensatedQuantity),
    };
  }

  async createCompensation(
    currentUser: AuthenticatedRequestUser,
    defectId: string,
    input: CreateDefectCompensationDto,
  ): Promise<DefectCompensationResponseDto> {
    const compensation = await createDefectCompensation(
      { defects: this.defects, compensations: this.compensations, productionOrders: this.productionOrders },
      {
        companyId: currentUser.companyId,
        defectId,
        compensatingProductionOrderId: input.compensatingProductionOrderId,
        compensatingVariantId: input.compensatingVariantId ?? null,
        quantity: input.quantity,
        createdBy: currentUser.id,
      },
    );

    // Явное подтверждение пользователем (владелец проекта, п.3) — фиксируем
    // отдельным действием аудита, не сливаем с записью самого дефекта.
    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: input.compensatingProductionOrderId,
      action: "production_order.defect_compensation_created",
      afterJson: { defectId, quantity: input.quantity, compensatingVariantId: input.compensatingVariantId ?? null },
    });

    return this.toCompensationResponse(compensation);
  }

  private toDefectResponse(row: ProductionOrderDefect, compensatedQuantity: number): ProductionOrderDefectResponseDto {
    const quantity = Number(row.quantity);
    return {
      id: row.id,
      productionOrderId: row.productionOrderId,
      qcResultId: row.qcResultId,
      productVariantId: row.productVariantId,
      quantity,
      reason: row.reason,
      compensatedQuantity,
      remainingQuantity: Math.max(0, quantity - compensatedQuantity),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toCompensationResponse(row: DefectCompensation): DefectCompensationResponseDto {
    return {
      id: row.id,
      defectId: row.defectId,
      compensatingProductionOrderId: row.compensatingProductionOrderId,
      compensatingVariantId: row.compensatingVariantId,
      quantity: Number(row.quantity),
      createdBy: row.createdBy,
      createdAt: row.createdAt,
    };
  }
}
