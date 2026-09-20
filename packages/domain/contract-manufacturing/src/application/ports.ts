import type { Workshop, WorkshopStatus } from "../domain/workshop";
import type {
  ProductionOrder,
  ProductionOrderStatus,
  ProductionOrderVariantDraft,
  ReceivedVariantInput,
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
  paymentTerms: string | null;
  deliveryMethod: string | null;
  signerRole: string | null;
  signerName: string | null;
  legalAddress: string | null;
  createdBy: string | null;
}

// Правка карточки цеха: заданы только те поля, которые действительно
// меняются (undefined — «не трогать», null — «очистить»). Отдельный тип от
// NewWorkshopInput, потому что у него другая семантика: там отсутствие
// значения означает null, здесь — сохранение прежнего.
export interface WorkshopPatch {
  name?: string;
  inn?: string | null;
  contactInfo?: string | null;
  specialization?: string | null;
  status?: WorkshopStatus;
  contractNumber?: string | null;
  contractDate?: string | null;
  paymentTerms?: string | null;
  deliveryMethod?: string | null;
  signerRole?: string | null;
  signerName?: string | null;
  legalAddress?: string | null;
}

export interface WorkshopRepository {
  create(input: NewWorkshopInput): Promise<Workshop>;
  update(id: string, patch: WorkshopPatch): Promise<Workshop>;
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
  sourceProductionOrderId: string | null;
  // Опциональны (Этап 3, «Production Master») — существующий ручной путь
  // (createProductionOrderDraft) их не передаёт, репозиторий пишет NULL.
  // Заполняются только новым путём создания партии из утверждённой
  // спецификации (createProductionOrderFromSpecification).
  specificationId?: string | null;
  orderNumber?: number | null;
  costSnapshot?: Record<string, unknown> | null;
}

export interface ProductionOrderRepository {
  create(input: NewProductionOrderInput): Promise<ProductionOrder>;
  findById(companyId: string, id: string): Promise<ProductionOrder | null>;
  updateStatus(id: string, status: ProductionOrderStatus): Promise<ProductionOrder>;
  // Приёмка партии (Итерация 10, факт — P0-1) — статус, receivedAt и
  // фактическое количество по каждому варианту устанавливаются одной
  // атомарной операцией, в отличие от updateStatus, который не знает о них.
  // received — фактическое количество по productVariantId; строки заказа,
  // для которых явно не передано значение, получают receivedQuantity, равный
  // плановому quantity (обратная совместимость: приёмка без указания факта
  // ведёт себя ровно как раньше).
  markReceived(id: string, received: ReceivedVariantInput[]): Promise<ProductionOrder>;
  // Безусловная запись — сама по себе НЕ проверяет, есть ли уже снимок.
  // Единственный корректный вызывающий — application/capture-production-order-cost-snapshot.ts
  // (P1-1), которая сначала проверяет assertCostSnapshotNotYetSet. Прямой
  // вызов этого метода в обход неё воспроизведёт старую дыру — перезапишет
  // существующий снимок молча.
  updateCostSnapshot(id: string, costSnapshot: Record<string, unknown>): Promise<ProductionOrder>;
  // Нужен для обработки входящего статус-обновления от цеха через Telegram
  // (Итерация 7) — сообщение не ссылается на конкретный productionOrderId
  // (простой текстовый ответ, не структурированная команда), поэтому
  // обновляется самый свежий незавершённый заказ этого цеха.
  findLatestActiveByWorkshop(companyId: string, workshopId: string): Promise<ProductionOrder | null>;
  listByCompany(companyId: string): Promise<ProductionOrder[]>;
  // Партии, порождённые конкретной утверждённой спецификацией (Этап 3) —
  // нужен, чтобы посчитать «сколько из спецификации уже размещено партиями»
  // (1 спецификация → N партий, в т.ч. частичных по количеству).
  listBySpecification(companyId: string, specificationId: string): Promise<ProductionOrder[]>;
  // Все партии конкретной модели (Model-first Minimal Core, владелец
  // проекта, 2026-09-12, ПРОМПТ №06.1) — история производства модели:
  // партии, созданные и через спецификацию (specificationId заполнен), и
  // вручную/до Этапа 3 (specificationId = null), все они ссылаются на
  // модель напрямую через productId, который существовал ещё до Этапа 3.
  listByProduct(companyId: string, productId: string): Promise<ProductionOrder[]>;
}

// Порт в модуль BOM — узкий срез, структурно совместимый с
// @garmentos/domain-bom (getApprovedBom), но не создающий реальную runtime-
// зависимость пакета на bom: композиция (тест/будущий NestJS-модуль)
// собирает адаптер поверх настоящего getApprovedBom (docs/PRINCIPLES.md,
// принцип 4 — Dependency Inversion, применённый к межмодульной границе, а не
// только к инфраструктуре).
export interface BomApprovalPort {
  isBomApproved(companyId: string, bomId: string, productId: string): Promise<boolean>;
  // ПРОМПТ №3, раздел 8 — новый визард заказа пошива не требует выбора BOM.
  // Возвращает id уже существующего approved BOM модели; если такого нет —
  // прозрачно заводит и утверждает пустой BOM (0 позиций материалов) и
  // возвращает его id. bom_id в production_orders остаётся NOT NULL — этот
  // метод существует, чтобы вызывающему никогда не приходилось создавать BOM
  // самому/показывать его пользователю.
  ensureApprovedBomForProduct(companyId: string, productId: string, createdBy: string | null): Promise<string>;
}

// Порт в модуль QC (ПРОМПТ №2.1, раздел C / ПРОМПТ №3, раздел 9) — узкий
// срез, нужный только rollbackProductionOrderStatus, чтобы запретить откат
// статуса, для которого уже зафиксирован результат ОТК (тот же паттерн
// Dependency Inversion, что и BomApprovalPort — Contract Manufacturing не
// импортирует @garmentos/domain-qc напрямую).
export interface QcResultLookupPort {
  hasResultForOrder(companyId: string, productionOrderId: string): Promise<boolean>;
}
