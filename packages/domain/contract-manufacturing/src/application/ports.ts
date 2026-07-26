import type { Workshop, WorkshopStatus } from "../domain/workshop";
import type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderVariantDraft,
} from "../domain/production-order";

export interface NewWorkshopInput {
  companyId: string;
  name: string;
  inn: string | null;
  contactInfo: string | null;
  specialization: string | null;
  status: WorkshopStatus;
  createdBy: string | null;
}

export interface WorkshopRepository {
  create(input: NewWorkshopInput): Promise<Workshop>;
  findById(companyId: string, id: string): Promise<Workshop | null>;
  findByTelegramChatId(chatId: string): Promise<Workshop | null>;
  setTelegramChatId(id: string, chatId: string): Promise<Workshop>;
}

export interface NewProductionOrderInput {
  companyId: string;
  productId: string;
  bomId: string;
  workshopId: string;
  plannedQuantity: number;
  agreedUnitPrice: number;
  materialsProvidedByUs: boolean;
  status: ProductionOrderStatus;
  dueDate: string | null;
  createdBy: string | null;
  variants: ProductionOrderVariantDraft[];
}

export interface ProductionOrderRepository {
  create(input: NewProductionOrderInput): Promise<ProductionOrder>;
  findById(companyId: string, id: string): Promise<ProductionOrder | null>;
  updateStatus(id: string, status: ProductionOrderStatus): Promise<ProductionOrder>;
}

// Порт в модуль BOM — узкий срез, структурно совместимый с
// @garmentos/domain-bom (getApprovedBom), но не создающий реальную runtime-
// зависимость пакета на bom: композиция (тест/будущий NestJS-модуль)
// собирает адаптер поверх настоящего getApprovedBom (docs/PRINCIPLES.md,
// принцип 4 — Dependency Inversion, применённый к межмодульной границе, а не
// только к инфраструктуре).
export interface BomApprovalPort {
  isBomApproved(companyId: string, bomId: string, productId: string): Promise<boolean>;
}
