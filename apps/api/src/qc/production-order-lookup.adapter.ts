import { Injectable } from "@nestjs/common";
import type { ProductionOrderLookupPort } from "@garmentos/domain-qc";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";

// Адаптер порта: ОТК не читает таблицу заказов напрямую
// (docs/PRINCIPLES.md, принцип 2) — узнаёт только статус, ничего больше.
@Injectable()
export class QcProductionOrderLookupAdapter implements ProductionOrderLookupPort {
  constructor(private readonly contractManufacturingService: ContractManufacturingService) {}

  async findStatus(companyId: string, productionOrderId: string): Promise<{ status: string } | null> {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    return order ? { status: order.status } : null;
  }
}
