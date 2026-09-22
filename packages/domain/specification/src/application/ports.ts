import type { Specification, SpecificationItem, SpecificationItemDraft, SpecificationSnapshot, SpecificationStatus } from "../domain/specification";

export interface NewSpecificationInput {
  companyId: string;
  workshopId: string;
  productId: string;
  status: SpecificationStatus;
  version: number;
  basedOnSpecificationId: string | null;
  deliveryDeadline: string | null;
  totalQuantity: number;
  totalSum: number;
  createdBy: string | null;
  items: Array<SpecificationItemDraft & { sum: number }>;
  // NEW-поток (ПРОМПТ №3) — все три опциональны и не заполняются legacy-
  // путём (createSpecificationDraft): productionOrderId связывает
  // спецификацию с заказом-источником, specNumber/prepaymentAmount
  // резервируются/считаются СРАЗУ при создании (не при отдельном approve),
  // потому что в этом потоке отдельного approve нет вовсе.
  productionOrderId?: string | null;
  specNumber?: number | null;
  prepaymentAmount?: number | null;
}

// Правка спецификации NEW-потока (ПРОМПТ №3, раздел 4/9) — заменяет строки
// целиком (тот же паттерн, что replaceProductSizes в catalog: удалить все,
// вставить заново, в одной транзакции), а не патчит по одной. undefined —
// поле не меняется этим вызовом.
export interface SpecificationUpdatePatch {
  workshopId?: string;
  deliveryDeadline?: string | null;
  totalQuantity?: number;
  totalSum?: number;
  items?: Array<SpecificationItemDraft & { sum: number }>;
}

export interface SpecificationRepository {
  create(input: NewSpecificationInput): Promise<Specification>;
  findById(companyId: string, id: string): Promise<Specification | null>;
  listByCompany(
    companyId: string,
    filter?: { productId?: string; workshopId?: string; status?: SpecificationStatus; productionOrderId?: string },
  ): Promise<Specification[]>;
  // Утверждение LEGACY-потока — одна атомарная операция (не update statusа
  // отдельно от остального): номер, snapshot и итоговая предоплата
  // фиксируются вместе с переходом в approved, чтобы не было промежуточного
  // состояния "approved, но без номера/снимка" при сбое между шагами.
  // companyId — defense-in-depth (аудит IDOR перед Этапом 2): единственный
  // вызывающий уже проверяет findById(companyId, id) до approve, но сам SQL
  // обязан фильтровать по компании и собственными силами, а не полагаться на
  // порядок вызовов.
  approve(
    companyId: string,
    id: string,
    input: { specNumber: number; prepaymentAmount: number; snapshotJson: SpecificationSnapshot },
  ): Promise<Specification>;
  // NEW-поток — правка полей/строк (версия инкрементируется внутри),
  // companyId — тот же defense-in-depth принцип, что и у approve.
  update(companyId: string, id: string, patch: SpecificationUpdatePatch): Promise<Specification>;
  // NEW-поток — отмена (единственное терминальное состояние здесь).
  cancel(companyId: string, id: string): Promise<Specification>;
  // Резолвер Order -> Specification (ПРОМПТ №3, раздел 9) — единственная
  // спецификация NEW-потока, созданная из этого заказа, если она есть
  // (1:1 — см. specifications_production_order_idx).
  findByProductionOrderId(companyId: string, productionOrderId: string): Promise<Specification | null>;
}

export type SpecificationItemRow = SpecificationItem;

// Узкие порты в чужие доменные модули (docs/PRINCIPLES.md, принцип 2 — тот
// же паттерн, что BomApprovalPort в contract-manufacturing): этот пакет не
// зависит рантаймом ни от @garmentos/domain-contract-manufacturing, ни от
// @garmentos/domain-catalog — только от структурно совместимых интерфейсов,
// которые apps/api подключает через реальные сервисы этих модулей.
export interface WorkshopLookupPort {
  findById(companyId: string, workshopId: string): Promise<{ id: string } | null>;
  // Атомарно резервирует следующий номер спецификации по договору цеха —
  // тот же счётчик (workshops.nextSpecificationNumber), что уже
  // использовался для генерации PDF; точка вызова просто переносится на
  // approve спецификации (требование №11).
  reserveNextSpecificationNumber(workshopId: string): Promise<number>;
}

export interface ProductLookupPort {
  findById(companyId: string, productId: string): Promise<{ id: string } | null>;
}

export interface ProductVariantLookupPort {
  findById(companyId: string, productVariantId: string): Promise<{ id: string; productId: string } | null>;
}
