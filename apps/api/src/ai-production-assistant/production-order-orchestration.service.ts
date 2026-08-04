import { Inject, Injectable, Logger } from "@nestjs/common";
import type { BomItem } from "@garmentos/domain-bom";
import type { ProductionOrder } from "@garmentos/domain-contract-manufacturing";
import type { AuditSource } from "@garmentos/domain-audit";
import type { DocumentEntity, SpecificationDocumentData, SpecificationLineItem } from "@garmentos/domain-document";
import { DomainError as WarehouseDomainError } from "@garmentos/domain-warehouse";
import type { ProductionOrderCostSnapshot } from "@garmentos/shared-types";
import { AuditService } from "../audit/audit.service";
import { BomService } from "../bom/bom.service";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DocumentService } from "../document/document.service";
import { IdentityService } from "../identity/identity.service";
import { ProcurementService } from "../procurement/procurement.service";
import { CostingService } from "../reporting/costing.service";
import type { TelegramClient } from "../telegram/telegram-client";
import { TELEGRAM_CLIENT } from "../telegram/telegram.tokens";
import { WarehouseService } from "../warehouse/warehouse.service";
import { ProductionRequestService } from "./production-request.service";
import { formatRuAmount, formatRuDate, formatRuQuantity } from "./ru-number-format";

// Стандартное условие оплаты компании (владелец проекта, 2026-08-03):
// 70% предоплата после выставления счёта, 30% при отгрузке товара со склада
// цеха — используется, только если у конкретного цеха (workshop.paymentTerms)
// ещё не настроено собственное условие.
const DEFAULT_PAYMENT_TERMS =
  "70% стоимости товара, указанной в спецификации, оплачиваются Заказчиком в течение 3 (трёх) рабочих дней после " +
  "получения счёта от Исполнителя. Остальные 30% оплачиваются Заказчиком в момент отгрузки Товара со склада Исполнителя.";

// Форма {message, code} — распознаётся DomainExceptionFilter по duck typing
// (apps/api/src/common/domain-exception.filter.ts), тот же паттерн, что
// ProductionRequestParseError в ai-classifier.ts.
export class ProductionRequestOrchestrationError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "ProductionRequestOrchestrationError";
  }
}

// Предпросмотр перед созданием (требование владельца проекта 2026-07-26):
// "перед созданием заказа AI должен показать, что именно понял, какие
// данные нашёл автоматически, какие отсутствуют и какие потенциальные
// проблемы обнаружил" — не просто Да/Нет. warnings — не блокируют показ
// предпросмотра, но canCreate=false, если чего-то критичного не хватает
// (модель/BOM/цех/цена/SKU) — тогда подтверждение ("Да") ничего не создаст,
// а объяснит, чего не хватает (та же ошибка, что бросил бы createFromText).
export interface ProductionRequestPreview {
  modelName: string;
  productFound: boolean;
  productSuggestions: string[];
  bomFound: boolean;
  workshopId: string | null;
  workshopName: string | null;
  workshopCandidates: string[];
  unitPrice: number | null;
  items: Array<{ colorName: string; size: string; quantity: number; skuFound: boolean }>;
  warnings: string[];
  canCreate: boolean;
}

interface PendingProductionRequest {
  companyId: string;
  text: string;
  workshopId: string;
  expiresAt: number;
}

const PENDING_REQUEST_TTL_MS = 15 * 60 * 1000; // 15 минут — разумное окно на "Да" в переписке

// Оркестрация вертикального сценария Итерации 7 (docs/ROADMAP.md): текст →
// разбор (AIClassifier) → резолв модели/BOM/SKU из каталога (уже
// существующих — AI не придумывает недостающее, только сообщает) →
// черновик заказа пошива; и отдельно — подтверждённый заказ → генерация
// спецификации по шаблону → отправка цеху в Telegram, если чат привязан.
// Сама оркестрация не доменная логика — каждый шаг делегирован
// существующему application-сервису соответствующего модуля.
@Injectable()
export class ProductionOrderOrchestrationService {
  // Состояние "запрос ждёт подтверждения" — временное, в памяти процесса (не
  // отдельная таблица БД: это разговорное состояние на несколько минут, не
  // бизнес-запись; при перезапуске процесса пользователь просто напишет
  // запрос заново). channelKey — обобщённый ключ канала (для Telegram это
  // chatId), не завязан на конкретный транспорт, чтобы Web/WhatsApp позже
  // использовали тот же механизм (требование владельца проекта 2026-07-26:
  // "Telegram — только интерфейс, вся логика должна жить в GarmentOS").
  private readonly pendingByChannel = new Map<string, PendingProductionRequest>();
  private readonly logger = new Logger(ProductionOrderOrchestrationService.name);

  constructor(
    private readonly productionRequestService: ProductionRequestService,
    private readonly catalogService: CatalogService,
    private readonly bomService: BomService,
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly documentService: DocumentService,
    private readonly identityService: IdentityService,
    private readonly procurementService: ProcurementService,
    private readonly warehouseService: WarehouseService,
    private readonly costingService: CostingService,
    private readonly auditService: AuditService,
    @Inject(TELEGRAM_CLIENT) private readonly telegramClient: TelegramClient,
  ) {}

  async createFromText(
    companyId: string,
    userId: string | null,
    workshopId: string,
    text: string,
  ): Promise<ProductionOrder> {
    const parsed = await this.productionRequestService.parse(text);

    const product = await this.catalogService.findProductByName(companyId, parsed.modelName);
    if (!product) {
      throw new ProductionRequestOrchestrationError(
        `Модель "${parsed.modelName}" не найдена в каталоге`,
        "PRODUCT_NOT_FOUND",
      );
    }

    const bom = await this.bomService.getApproved(companyId, { productId: product.id });
    if (!bom) {
      throw new ProductionRequestOrchestrationError(
        `У модели "${parsed.modelName}" нет утверждённого BOM`,
        "BOM_NOT_FOUND",
      );
    }

    if (parsed.unitPrice === null) {
      throw new ProductionRequestOrchestrationError(
        "В запросе не указана цена пошива",
        "PRODUCTION_REQUEST_PRICE_MISSING",
      );
    }

    const variants: Array<{ productVariantId: string; quantity: number }> = [];
    for (const item of parsed.items) {
      const variant = await this.catalogService.findProductVariant(product.id, item.size, item.colorName);
      if (!variant) {
        throw new ProductionRequestOrchestrationError(
          `SKU не найден: модель "${parsed.modelName}", цвет "${item.colorName}", размер "${item.size}"`,
          "PRODUCT_VARIANT_NOT_FOUND",
        );
      }
      variants.push({ productVariantId: variant.id, quantity: item.quantity });
    }

    const plannedQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);

    return this.contractManufacturingService.createProductionOrderDraft(companyId, {
      productId: product.id,
      bomId: bom.id,
      workshopId,
      plannedQuantity,
      agreedUnitPrice: parsed.unitPrice,
      variants,
      createdBy: userId ?? undefined,
    });
  }

  // Строит предпросмотр без создания каких-либо записей — "показать, что
  // понял, что нашёл, чего не хватает" (требование владельца проекта
  // 2026-07-26). Резолвит цех автоматически: если он назван в тексте
  // ("Цех: ...") или у компании ровно один активный цех — выбирается сам;
  // иначе перечисляется как проблема (AI не имеет права придумать цех).
  async buildPreview(companyId: string, text: string): Promise<ProductionRequestPreview> {
    const parsed = await this.productionRequestService.parse(text);
    const warnings: string[] = [];

    const product = await this.catalogService.findProductByName(companyId, parsed.modelName);
    let productSuggestions: string[] = [];
    if (!product) {
      productSuggestions = await this.catalogService.findSimilarProductNames(companyId, parsed.modelName);
      warnings.push(
        `Модель "${parsed.modelName}" не найдена в каталоге` +
          (productSuggestions.length > 0 ? ` — возможно, вы имели в виду: ${productSuggestions.join(", ")}` : ""),
      );
    }

    let bomFound = false;
    let bomItems: BomItem[] = [];
    if (product) {
      const bom = await this.bomService.getApproved(companyId, { productId: product.id });
      bomFound = !!bom;
      if (bom) bomItems = bom.items;
      if (!bomFound) warnings.push(`У модели "${parsed.modelName}" нет утверждённого BOM`);
    }

    const workshops = await this.contractManufacturingService.listActiveWorkshops(companyId);
    let workshopId: string | null = null;
    let workshopName: string | null = null;
    const workshopCandidates: string[] = [];
    if (parsed.workshopName) {
      const named = workshops.find((w) => w.name.toLowerCase().includes(parsed.workshopName!.toLowerCase()));
      if (named) {
        workshopId = named.id;
        workshopName = named.name;
      } else {
        warnings.push(`Цех "${parsed.workshopName}" не найден среди активных цехов`);
      }
    } else if (workshops.length === 1 && workshops[0]) {
      workshopId = workshops[0].id;
      workshopName = workshops[0].name;
    } else if (workshops.length === 0) {
      warnings.push("В системе нет ни одного активного цеха");
    } else {
      workshopCandidates.push(...workshops.map((w) => w.name));
      warnings.push(`Уточните цех — активны: ${workshopCandidates.join(", ")}`);
    }
    if (workshopId) {
      const workshop = workshops.find((w) => w.id === workshopId);
      if (workshop && !workshop.contractNumber) {
        warnings.push(`Для цеха "${workshop.name}" не указан действующий договор`);
      }
    }

    if (parsed.unitPrice === null) {
      warnings.push("Не указана цена пошива");
    }

    const items: ProductionRequestPreview["items"] = [];
    for (const item of parsed.items) {
      let skuFound = false;
      if (product) {
        const variant = await this.catalogService.findProductVariant(product.id, item.size, item.colorName);
        skuFound = !!variant;
        if (!skuFound) warnings.push(`SKU не найден: цвет "${item.colorName}", размер "${item.size}"`);
      }
      items.push({ colorName: item.colorName, size: item.size, quantity: item.quantity, skuFound });
    }

    if (bomFound && bomItems.length > 0) {
      const totalQuantity = parsed.items.reduce((sum, item) => sum + item.quantity, 0);
      warnings.push(...(await this.checkMaterialAvailability(companyId, bomItems, totalQuantity)));
    }

    const canCreate =
      !!product && bomFound && !!workshopId && parsed.unitPrice !== null && items.every((item) => item.skuFound);

    return {
      modelName: parsed.modelName,
      productFound: !!product,
      productSuggestions,
      bomFound,
      workshopId,
      workshopName,
      workshopCandidates,
      unitPrice: parsed.unitPrice,
      items,
      warnings,
      canCreate,
    };
  }

  // Проверка наличия материалов — предупреждение, не блокирует создание
  // заказа (в отличие от отсутствующей модели/BOM/цеха/SKU): нехватка
  // материала — бизнес-риск, устранимый закупкой позже, а не структурная
  // невозможность создать заказ (владелец проекта, 2026-08-02: "проверить
  // наличие ткани и фурнитуры"). Склад резолвится автоматически, только если
  // у компании ровно один — тот же принцип, что и авторезолв цеха.
  private async checkMaterialAvailability(companyId: string, bomItems: BomItem[], totalQuantity: number): Promise<string[]> {
    const warehouses = await this.warehouseService.listWarehouses(companyId);
    if (warehouses.length === 0) {
      return ["В системе нет ни одного склада — не удалось проверить наличие материалов"];
    }
    if (warehouses.length > 1) {
      return ["У компании несколько складов — не удалось однозначно проверить наличие материалов"];
    }
    const warehouse = warehouses[0];
    if (!warehouse) return [];

    const warnings: string[] = [];
    for (const bomItem of bomItems) {
      const required = totalQuantity * Number(bomItem.quantityPerUnit) * (1 + Number(bomItem.wastePercent) / 100);
      const stockItem = await this.warehouseService.findMaterialStockItem(warehouse.id, bomItem.materialId);
      const onHand = stockItem ? Number(stockItem.quantityOnHand) : 0;
      if (onHand < required) {
        const material = await this.procurementService.findMaterialById(companyId, bomItem.materialId);
        warnings.push(
          `Недостаточно материала "${material?.name ?? bomItem.materialId}": требуется ${formatRuQuantity(required)}` +
            `${material ? ` ${material.unit}` : ""}, на складе ${formatRuQuantity(onHand)}`,
        );
      }
    }
    return warnings;
  }

  // Расход материала при подтверждении заказа — вызывается только если
  // материалы предоставляет компания (production_orders.materials_provided_by_us,
  // по умолчанию true — CLAUDE.md, глоссарий: цех шьёт из наших материалов).
  // Недостаток на складе не блокирует уже подтверждённый заказ (он был
  // видимым предупреждением ещё в предпросмотре) — записывается расход по
  // тому, что реально есть, остальное просто не списывается, ошибка логируется.
  private async consumeMaterialsForOrder(companyId: string, order: ProductionOrder): Promise<void> {
    if (!order.materialsProvidedByUs) return;

    const bom = await this.bomService.getApproved(companyId, { productId: order.productId });
    if (!bom) return;

    const warehouses = await this.warehouseService.listWarehouses(companyId);
    const warehouse = warehouses.length === 1 ? warehouses[0] : undefined;
    if (!warehouse) return;

    const totalQuantity = order.variants.reduce((sum, variant) => sum + Number(variant.quantity), 0);
    for (const bomItem of bom.items) {
      const required = totalQuantity * Number(bomItem.quantityPerUnit) * (1 + Number(bomItem.wastePercent) / 100);
      try {
        await this.warehouseService.consumeMaterialStock(warehouse.id, bomItem.materialId, required, {
          referenceType: "production_order",
          referenceId: order.id,
        });
      } catch (error) {
        if (error instanceof WarehouseDomainError) {
          this.logger.warn(`Недостаточно материала ${bomItem.materialId} для заказа ${order.id}: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
  }

  // Предпросмотр, адресованный конкретному разговорному каналу (Telegram-чат
  // и т.п.) — хранит состояние "ждёт подтверждения" отдельно на каждый канал,
  // не глобально на компанию (два чата одной компании не должны путать друг
  // друга предложениями).
  async previewFromTextForChannel(companyId: string, channelKey: string, text: string): Promise<ProductionRequestPreview> {
    const preview = await this.buildPreview(companyId, text);
    if (preview.canCreate && preview.workshopId) {
      this.pendingByChannel.set(channelKey, {
        companyId,
        text,
        workshopId: preview.workshopId,
        expiresAt: Date.now() + PENDING_REQUEST_TTL_MS,
      });
    } else {
      this.pendingByChannel.delete(channelKey);
    }
    return preview;
  }

  hasPendingRequest(channelKey: string): boolean {
    const pending = this.pendingByChannel.get(channelKey);
    return !!pending && pending.expiresAt > Date.now();
  }

  // Явная отмена (кнопка "Отменить", владелец проекта 2026-08-02) — не ждёт
  // TTL, снимает предпросмотр сразу. Возвращает false, если отменять было
  // нечего (запрос уже истёк/отсутствовал) — вызывающий код форматирует ответ.
  cancelPendingRequest(channelKey: string): boolean {
    const hadPending = this.hasPendingRequest(channelKey);
    this.pendingByChannel.delete(channelKey);
    return hadPending;
  }

  // Вызывается после того, как человек ответил "Да" — только теперь система
  // реально создаёт заказ, списывает расход материалов (consumeMaterialsForOrder,
  // Итерация 9), формирует PDF и отправляет спецификацию цеху (требование
  // владельца проекта 2026-07-26: подтверждение должно быть осмысленным, не
  // просто Да/Нет "в никуда", и весь путь выполняется одним подтверждением).
  async confirmPendingRequest(
    channelKey: string,
    userId: string | null,
  ): Promise<{ order: ProductionOrder; document: DocumentEntity }> {
    const pending = this.pendingByChannel.get(channelKey);
    if (!pending || pending.expiresAt < Date.now()) {
      this.pendingByChannel.delete(channelKey);
      throw new ProductionRequestOrchestrationError(
        "Нет запроса, ожидающего подтверждения, или он устарел — опишите заказ заново",
        "NO_PENDING_PRODUCTION_REQUEST",
      );
    }
    this.pendingByChannel.delete(channelKey);

    const draft = await this.createFromText(pending.companyId, userId, pending.workshopId, pending.text);
    const order = await this.confirmProductionOrder(pending.companyId, draft.id, userId, "telegram");
    await this.consumeMaterialsForOrder(pending.companyId, order);
    const document = await this.generateAndSendSpecification(pending.companyId, order.id, userId);
    return { order, document };
  }

  // Подтверждение заказа (draft→placed) + фиксация Snapshot партии одним
  // шагом (владелец проекта, 2026-08-03 — «Паспорт партии»,
  // docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md, раздел «Snapshot
  // партии»): себестоимость по текущим закупочным ценам, условия оплаты и
  // реквизиты договора цеха фиксируются РОВНО в этот момент и больше
  // никогда не пересчитываются — даже если позже изменятся цены материалов
  // или карточка цеха. Это единственный путь подтверждения заказа в API
  // (production-orders.controller.ts вызывает этот метод, не
  // ContractManufacturingService.confirmProductionOrder напрямую) — иначе
  // часть заказов осталась бы без снимка.
  async confirmProductionOrder(
    companyId: string,
    productionOrderId: string,
    userId: string | null,
    source: AuditSource = "http_api",
  ): Promise<ProductionOrder> {
    const draft = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    if (!draft) {
      throw new ProductionRequestOrchestrationError(
        `Заказ пошива ${productionOrderId} не найден`,
        "PRODUCTION_ORDER_NOT_FOUND",
      );
    }
    const [workshop, company] = await Promise.all([
      this.contractManufacturingService.findWorkshopById(companyId, draft.workshopId),
      this.identityService.findCompanyById(companyId),
    ]);
    if (!workshop) {
      throw new ProductionRequestOrchestrationError(`Цех ${draft.workshopId} не найден`, "WORKSHOP_NOT_FOUND");
    }
    if (!company) {
      throw new ProductionRequestOrchestrationError(`Компания ${companyId} не найдена`, "COMPANY_NOT_FOUND");
    }
    // Основание генерации (owner, 2026-08-03 — «Паспорт партии», раздел 5):
    // без номера договора спецификация физически не может быть выпущена
    // ("Спецификация №N к договору № ___") — а раз он фиксируется в Snapshot
    // именно сейчас и больше не меняется, проверить его нужно ДО перевода
    // заказа в "placed", а не после: иначе при отказе заказ навсегда
    // остаётся подтверждённым, но без снимка (assertCanConfirm разрешает
    // подтверждение только из "draft" — повторно не подтвердить).
    if (!workshop.contractNumber) {
      throw new ProductionRequestOrchestrationError(
        `У цеха "${workshop.name}" не указан номер договора — заполните его в карточке цеха перед подтверждением заказа`,
        "WORKSHOP_CONTRACT_NUMBER_MISSING",
      );
    }

    // computeSpecificationPricing тоже валидирует "основание генерации" —
    // бросает 404, если у модели нет утверждённого BOM — тоже до перевода
    // статуса, по той же причине.
    const pricing = await this.costingService.computeSpecificationPricing(companyId, draft.productId);
    const snapshot: ProductionOrderCostSnapshot = {
      capturedAt: new Date().toISOString(),
      fabricCostPerUnit: pricing.fabricCostPerUnit,
      trimCostPerUnit: pricing.trimCostPerUnit,
      packagingCostPerUnit: pricing.packagingCostPerUnit,
      sewingCostPerUnit: pricing.sewingCostPerUnit,
      otherCostPerUnit: pricing.otherCostPerUnit,
      actualCostPerUnit: pricing.actualCostPerUnit,
      deductionPerUnit: pricing.deductionPerUnit,
      specificationPricePerUnit: pricing.specificationPricePerUnit,
      materialsWithoutPriceHistory: pricing.materialsWithoutPriceHistory,
      paymentTerms: workshop.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
      deliveryMethod: workshop.deliveryMethod ?? "",
      contractNumber: workshop.contractNumber,
      contractDate: workshop.contractDate ?? "",
      contractorName: workshop.name,
      customerName: company.legalName ?? company.name,
      contractorSignerRole: workshop.signerRole ?? "",
      contractorSignerName: workshop.signerName ?? "",
      customerSignerName: company.signerName ?? "",
    };

    const order = await this.contractManufacturingService.confirmProductionOrder(companyId, productionOrderId);
    const confirmed = await this.contractManufacturingService.updateProductionOrderCostSnapshot(order.id, snapshot);

    // Аудит партии (владелец проекта, 2026-08-04: "кто изменил партию, когда,
    // что изменил, старое/новое значение" — момент подтверждения заказа —
    // самое важное событие в жизни партии, здесь фиксируется Snapshot
    // себестоимости, который больше никогда не пересчитывается).
    await this.auditService.record(companyId, userId, source, {
      entityType: "production_order",
      entityId: confirmed.id,
      action: "production_order.confirmed",
      beforeJson: { status: draft.status },
      afterJson: { status: confirmed.status, costSnapshot: snapshot },
    });

    return confirmed;
  }

  async generateAndSendSpecification(
    companyId: string,
    productionOrderId: string,
    uploadedBy: string | null,
  ): Promise<DocumentEntity> {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    if (!order) {
      throw new ProductionRequestOrchestrationError(
        `Заказ пошива ${productionOrderId} не найден`,
        "PRODUCTION_ORDER_NOT_FOUND",
      );
    }
    if (order.status === "draft") {
      throw new ProductionRequestOrchestrationError(
        "Заказ пошива ещё не подтверждён — сначала подтвердите его",
        "PRODUCTION_ORDER_NOT_PLACED",
      );
    }

    const [workshop, company, product] = await Promise.all([
      this.contractManufacturingService.findWorkshopById(companyId, order.workshopId),
      this.identityService.findCompanyById(companyId),
      this.catalogService.findProductById(companyId, order.productId),
    ]);
    if (!workshop) {
      throw new ProductionRequestOrchestrationError(`Цех ${order.workshopId} не найден`, "WORKSHOP_NOT_FOUND");
    }
    if (!company) {
      throw new ProductionRequestOrchestrationError(`Компания ${companyId} не найдена`, "COMPANY_NOT_FOUND");
    }
    if (!product) {
      throw new ProductionRequestOrchestrationError(`Модель ${order.productId} не найдена`, "PRODUCT_NOT_FOUND");
    }

    const unitPrice = Number(order.agreedUnitPrice);
    const items: SpecificationLineItem[] = [];
    let totalQuantity = 0;
    let totalSum = 0;
    for (const variant of order.variants) {
      const productVariant = await this.catalogService.findProductVariantById(variant.productVariantId);
      if (!productVariant) continue;
      const quantity = Number(variant.quantity);
      const sum = quantity * unitPrice;
      totalQuantity += quantity;
      totalSum += sum;
      items.push({
        name: `${product.name}, ${productVariant.color}`,
        unit: "шт",
        size: productVariant.size,
        quantity: formatRuQuantity(quantity),
        unitPrice: formatRuAmount(unitPrice),
        sum: formatRuAmount(sum),
      });
    }

    // Номер спецификации — атомарно резервируется по договору цеха (каждая
    // генерация получает следующий номер, не переиспользует прежний —
    // "на каждую модель спецификация должна быть разная, соответственно
    // нумерация и даты", требование владельца проекта 2026-07-26).
    const specNumber = await this.contractManufacturingService.reserveNextSpecificationNumber(workshop.id);

    // Условия оплаты/способ доставки/реквизиты договора/подписанты
    // подставляются из Snapshot партии (owner, 2026-08-03 — «Паспорт
    // партии»), зафиксированного при подтверждении заказа
    // (confirmProductionOrder выше) — не из живой карточки цеха/компании.
    // Это гарантирует, что спецификация №2, сгенерированная повторно через
    // месяц для того же заказа, покажет ТЕ ЖЕ условия, что и спецификация
    // №1, даже если цех успел сменить условия оплаты или реквизиты договора
    // в своих настройках. order.costSnapshot === null только у заказов,
    // подтверждённых до появления этого механизма — для них сохраняется
    // прежнее поведение (живые данные), а не отказ в генерации.
    const snapshot = order.costSnapshot as ProductionOrderCostSnapshot | null;
    const data: SpecificationDocumentData = {
      fields: {
        contractNumber: snapshot?.contractNumber ?? workshop.contractNumber ?? "",
        contractDate: formatRuDate(snapshot?.contractDate ?? workshop.contractDate),
        customerName: snapshot?.customerName ?? company.legalName ?? company.name,
        contractorName: snapshot?.contractorName ?? workshop.name,
        specNumber: String(specNumber),
        paymentTerms: snapshot?.paymentTerms ?? workshop.paymentTerms ?? DEFAULT_PAYMENT_TERMS,
        deliveryDeadline: formatRuDate(order.dueDate),
        deliveryMethod: snapshot?.deliveryMethod ?? workshop.deliveryMethod ?? "",
        contractorSignerRole: snapshot?.contractorSignerRole ?? workshop.signerRole ?? "",
        contractorSignerName: snapshot?.contractorSignerName ?? workshop.signerName ?? "",
        customerSignerName: snapshot?.customerSignerName ?? company.signerName ?? "",
      },
      items,
      totals: { quantity: formatRuQuantity(totalQuantity), sum: formatRuAmount(totalSum) },
    };

    const result = await this.documentService.generateSpecification(companyId, productionOrderId, uploadedBy, data);

    await this.auditService.record(companyId, uploadedBy, "http_api", {
      entityType: "production_order",
      entityId: productionOrderId,
      action: "document.specification_generated",
      afterJson: { documentId: result.document.id, specNumber: data.fields.specNumber },
    });

    if (workshop.telegramChatId) {
      await this.telegramClient.sendDocument(
        workshop.telegramChatId,
        result.document.fileUrl,
        `Спецификация №${data.fields.specNumber}`,
      );
    }

    return result.document;
  }
}
