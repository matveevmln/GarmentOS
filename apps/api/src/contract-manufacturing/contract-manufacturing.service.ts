import { Inject, Injectable } from "@nestjs/common";
import {
  confirmProductionOrder,
  createProductionOrderDraft,
  createWorkshop,
  updateProductionOrderStatusFromWorkshop,
  type BomApprovalPort,
  type ProductionOrder,
  type ProductionOrderRepository,
  type Workshop,
  type WorkshopRepository,
} from "@garmentos/domain-contract-manufacturing";
import type { CreateProductionOrderDto, CreateWorkshopDto } from "@garmentos/shared-types";
import { BOM_APPROVAL_PORT, PRODUCTION_ORDER_REPOSITORY, WORKSHOP_REPOSITORY } from "./contract-manufacturing.tokens";

// Тонкий presentation-адаптер поверх packages/domain/contract-manufacturing
// (docs/ARCHITECTURE.md, раздел 2) — репозитории и порт BomApprovalPort
// внедряются через DI по токенам, тот же паттерн, что и в остальных модулях.
@Injectable()
export class ContractManufacturingService {
  constructor(
    @Inject(WORKSHOP_REPOSITORY) private readonly workshops: WorkshopRepository,
    @Inject(PRODUCTION_ORDER_REPOSITORY) private readonly productionOrders: ProductionOrderRepository,
    @Inject(BOM_APPROVAL_PORT) private readonly bomApproval: BomApprovalPort,
  ) {}

  async createWorkshop(companyId: string, input: CreateWorkshopDto): Promise<Workshop> {
    return createWorkshop({ workshops: this.workshops }, { ...input, companyId });
  }

  async createProductionOrderDraft(companyId: string, input: CreateProductionOrderDto): Promise<ProductionOrder> {
    return createProductionOrderDraft(
      { productionOrders: this.productionOrders, workshops: this.workshops, bomApproval: this.bomApproval },
      { ...input, companyId },
    );
  }

  async confirmProductionOrder(companyId: string, productionOrderId: string): Promise<ProductionOrder> {
    return confirmProductionOrder({ productionOrders: this.productionOrders }, { companyId, productionOrderId });
  }

  async findProductionOrderById(companyId: string, id: string): Promise<ProductionOrder | null> {
    return this.productionOrders.findById(companyId, id);
  }

  async findWorkshopById(companyId: string, id: string): Promise<Workshop | null> {
    return this.workshops.findById(companyId, id);
  }

  async updateProductionOrderStatusFromWorkshop(
    companyId: string,
    workshopId: string,
    status: "in_progress" | "ready_for_pickup",
  ): Promise<ProductionOrder> {
    return updateProductionOrderStatusFromWorkshop(
      { productionOrders: this.productionOrders },
      { companyId, workshopId, status },
    );
  }

  async reserveNextSpecificationNumber(workshopId: string): Promise<number> {
    return this.workshops.reserveNextSpecificationNumber(workshopId);
  }

  async listActiveWorkshops(companyId: string): Promise<Workshop[]> {
    return this.workshops.listActiveByCompany(companyId);
  }
}
