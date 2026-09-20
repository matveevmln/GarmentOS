import { HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { recordQcResult, type ProductionOrderLookupPort, type QcResultRepository } from "@garmentos/domain-qc";
import type { QcResultResponseDto, RecordQcResultDto } from "@garmentos/shared-types";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { DefectService } from "../defect/defect.service";
import { QC_PRODUCTION_ORDER_PORT, QC_RESULT_REPOSITORY } from "./qc.tokens";

// Тонкий presentation-адаптер поверх packages/domain/qc, тот же паттерн, что
// CuttingService поверх packages/domain/cutting.
@Injectable()
export class QcService {
  constructor(
    @Inject(QC_RESULT_REPOSITORY) private readonly qcResults: QcResultRepository,
    @Inject(QC_PRODUCTION_ORDER_PORT) private readonly productionOrders: ProductionOrderLookupPort,
    private readonly auditService: AuditService,
    private readonly defectService: DefectService,
  ) {}

  private toResponse(result: Awaited<ReturnType<QcResultRepository["create"]>>): QcResultResponseDto {
    return {
      id: result.id,
      productionOrderId: result.productionOrderId,
      receivedQuantity: Number(result.receivedQuantity),
      goodQuantity: Number(result.goodQuantity),
      defectQuantity: Number(result.defectQuantity),
      comment: result.comment,
      createdBy: result.createdBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  }

  async record(
    currentUser: AuthenticatedRequestUser,
    productionOrderId: string,
    input: RecordQcResultDto,
  ): Promise<QcResultResponseDto> {
    // Проверка разбивки брака ДО записи результата ОТК (владелец проекта,
    // этап B): результат ОТК — ровно один финальный на заказ, поэтому
    // невалидную разбивку нужно отклонить раньше, чем возникнет результат,
    // который потом нельзя ни исправить, ни перезаписать.
    if (input.defectQuantity > 0) {
      await this.defectService.validateBreakdownForQc(
        currentUser.companyId,
        productionOrderId,
        input.defectQuantity,
        input.defectBreakdown?.map((row) => ({
          productVariantId: row.productVariantId ?? null,
          quantity: row.quantity,
          reason: row.reason ?? null,
        })),
      );
    }

    const result = await recordQcResult(
      { qcResults: this.qcResults, productionOrders: this.productionOrders },
      {
        companyId: currentUser.companyId,
        productionOrderId,
        receivedQuantity: input.receivedQuantity,
        goodQuantity: input.goodQuantity,
        defectQuantity: input.defectQuantity,
        comment: input.comment ?? null,
        createdBy: currentUser.id,
      },
    );

    // ОТК — факт о партии, а не отдельный от неё объект (владелец проекта,
    // 2026-09-06): пишем в тот же entityType, что confirm/receive, чтобы
    // история заказа оставалась одной лентой, а не разъезжалась по сущностям.
    await this.auditService.recordForUser(currentUser, {
      entityType: "production_order",
      entityId: productionOrderId,
      action: "production_order.qc_recorded",
      afterJson: {
        receivedQuantity: input.receivedQuantity,
        goodQuantity: input.goodQuantity,
        defectQuantity: input.defectQuantity,
      },
    });

    // Структурированный брак (этап B, владелец проекта, 2026-09-15) — заводится
    // автоматически вместе с результатом ОТК, единственный раз на результат
    // (assertNoExistingDefectsForQcResult внутри). defectQuantity === 0 — нечего
    // фиксировать, дефекта не будет вовсе (не пустая строка "0 брака").
    if (input.defectQuantity > 0) {
      await this.defectService.recordDefectsForQcResult(
        currentUser,
        productionOrderId,
        result.id,
        input.defectQuantity,
        input.defectBreakdown?.map((row) => ({
          productVariantId: row.productVariantId ?? null,
          quantity: row.quantity,
          reason: row.reason ?? null,
        })),
      );
    }

    return this.toResponse(result);
  }

  async findByProductionOrder(companyId: string, productionOrderId: string): Promise<QcResultResponseDto> {
    const result = await this.qcResults.findByProductionOrder(companyId, productionOrderId);
    if (!result) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "QC_RESULT_NOT_FOUND",
        message: `Результат ОТК для заказа ${productionOrderId} не найден`,
      });
    }
    return this.toResponse(result);
  }

  // Для списков (Фулфилмент ОТК, ПРОМПТ №3 раздел 10) — большинство заказов
  // ещё не имеют результата ОТК, это нормальное состояние, не ошибка.
  async tryFindByProductionOrder(companyId: string, productionOrderId: string): Promise<QcResultResponseDto | null> {
    const result = await this.qcResults.findByProductionOrder(companyId, productionOrderId);
    return result ? this.toResponse(result) : null;
  }
}
