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
  contractNumber: string | null;
  contractDate: string | null;
  createdBy: string | null;
}

export interface WorkshopRepository {
  create(input: NewWorkshopInput): Promise<Workshop>;
  findById(companyId: string, id: string): Promise<Workshop | null>;
  findByTelegramChatId(chatId: string): Promise<Workshop | null>;
  setTelegramChatId(id: string, chatId: string): Promise<Workshop>;
  // Действующие цеха компании — нужен для авторезолва цеха в текстовом
  // производственном запросе, когда он явно не назван (Итерация 7): если
  // ровно один активный цех, выбирается автоматически.
  listActiveByCompany(companyId: string): Promise<Workshop[]>;
  // Атомарно резервирует следующий номер спецификации по договору этого
  // цеха и возвращает именно тот номер, который нужно использовать сейчас
  // (не значение счётчика после инкремента) — docs/DOCUMENT_ENGINE_ARCHITECTURE.md,
  // Итерация 7: "на каждую модель спецификация должна быть разная,
  // соответственно нумерация и даты".
  reserveNextSpecificationNumber(id: string): Promise<number>;
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
  // Нужен для обработки входящего статус-обновления от цеха через Telegram
  // (Итерация 7) — сообщение не ссылается на конкретный productionOrderId
  // (простой текстовый ответ, не структурированная команда), поэтому
  // обновляется самый свежий незавершённый заказ этого цеха.
  findLatestActiveByWorkshop(companyId: string, workshopId: string): Promise<ProductionOrder | null>;
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
