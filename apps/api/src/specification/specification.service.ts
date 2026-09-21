import { BadRequestException, HttpStatus, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  approveSpecification,
  cancelSpecification,
  createSpecificationDraft,
  createSpecificationFromExisting,
  createSpecificationFromProductionOrder,
  updateSpecification,
  type ProductLookupPort,
  type ProductVariantLookupPort,
  type Specification,
  type SpecificationRepository,
  type SpecificationSnapshot,
  type SpecificationStatus,
  type WorkshopLookupPort,
} from "@garmentos/domain-specification";
import type { ProductionOrder, ProductionOrderVariantDraft } from "@garmentos/domain-contract-manufacturing";
import type { AttachDocumentResult, SpecificationDocumentData } from "@garmentos/domain-document";
import type {
  CreateProductionOrderFromSpecificationDto,
  CreateSpecificationDraftDto,
  CreateSpecificationFromExistingDto,
  ProductionOrderCostSnapshot,
  SpecificationAvailableQuantityResponseDto,
  UpdateSpecificationDto,
} from "@garmentos/shared-types";
import { AuditService } from "../audit/audit.service";
import { BomService } from "../bom/bom.service";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DocumentService } from "../document/document.service";
import { computeSpecificationLinePricing } from "../ai-production-assistant/specification-pricing";
import {
  formatDeliveryPeriodText,
  formatRuAmount,
  formatRuAmountNoDecimals,
  formatRuDate,
  formatRuQuantity,
  formatRuQuantityNoGrouping,
} from "../ai-production-assistant/ru-number-format";
import { IdentityService } from "../identity/identity.service";
import { CostingService } from "../reporting/costing.service";
import {
  SPECIFICATION_PRODUCT_PORT,
  SPECIFICATION_PRODUCT_VARIANT_PORT,
  SPECIFICATION_REPOSITORY,
  SPECIFICATION_WORKSHOP_PORT,
} from "./specification.tokens";

// Условие оплаты по умолчанию — используется, только если у конкретного цеха
// (workshop.paymentTerms) собственное условие не настроено. Дословно
// соответствует эталонному документу (ПРОМПТ №10.3, владелец проекта,
// 2026-09-17: read-only сверка PDF-эталона через pdfplumber выявила, что
// прежний текст здесь — "70%/30% в течение 3 дней" — НЕ совпадал с реальной
// формулировкой эталона: "Предоплата 70% составляет N руб. Окончательный
// расчёт... ЭСФ..." плюс отдельный абзац про отклонение ±10%). Процент
// предоплаты (70%) — бизнес-факт компании, не выводится логикой (CLAUDE.md,
// правило 8б) — тот же факт, что был закреплён и в предыдущем тексте. Не
// вынесено в общий модуль намеренно — короткая бизнес-формулировка, не код;
// дублирование с production-order-orchestration.service.ts дешевле, чем
// кросс-модульная зависимость ради одной строки (docs/PRINCIPLES.md, принцип 2).
//
// Плейсхолдеры внутри резолвятся ЗДЕСЬ (не через шаблонный applyPlaceholders)
// — итоговая строка целиком подставляется в {{paymentTerms}} самого шаблона,
// поэтому вложенные {{...}} внутри неё повторно не обработались бы.
function formatDefaultPaymentTerms(totalSum: number): string {
  const prepaymentPercent = 70;
  const prepaymentAmount = formatRuAmount((totalSum * prepaymentPercent) / 100);
  return (
    `Предоплата ${prepaymentPercent}% составляет ${prepaymentAmount} руб. Окончательный расчёт производится на основании ` +
    "фактически отгруженного количества единиц товара, указанного в Электронном счете-фактуре (ЭСФ), в течение 5 рабочих " +
    "дней с даты выставления ЭСФ.\n\n" +
    "Допускается отклонение фактического количества товара от указанного в настоящей Спецификации в пределах ±10% без " +
    "составления дополнительного соглашения."
  );
}

// Тонкий presentation-адаптер поверх packages/domain/specification
// (docs/ARCHITECTURE.md, раздел 2) — тот же паттерн, что и остальные Service
// в apps/api. Approve — единственный метод, которому нужны дополнительные
// сервисы (Catalog/ContractManufacturing/Identity) напрямую, не только через
// узкие порты: снимок спецификации требует человекочитаемых полей (название
// цеха, компании, цвет варианта), которых нет в узких портах домена.
@Injectable()
export class SpecificationService {
  constructor(
    @Inject(SPECIFICATION_REPOSITORY) private readonly specifications: SpecificationRepository,
    @Inject(SPECIFICATION_WORKSHOP_PORT) private readonly workshopPort: WorkshopLookupPort,
    @Inject(SPECIFICATION_PRODUCT_PORT) private readonly productPort: ProductLookupPort,
    @Inject(SPECIFICATION_PRODUCT_VARIANT_PORT) private readonly productVariantPort: ProductVariantLookupPort,
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly catalogService: CatalogService,
    private readonly identityService: IdentityService,
    private readonly documentService: DocumentService,
    private readonly costingService: CostingService,
    private readonly bomService: BomService,
    private readonly auditService: AuditService,
  ) {}

  async createDraft(companyId: string, input: CreateSpecificationDraftDto, createdBy: string | null): Promise<Specification> {
    return createSpecificationDraft(
      { specifications: this.specifications, workshops: this.workshopPort, products: this.productPort, productVariants: this.productVariantPort },
      {
        companyId,
        workshopId: input.workshopId,
        productId: input.productId,
        deliveryDeadline: input.deliveryDeadline ?? null,
        items: input.items,
        createdBy,
      },
    );
  }

  async createFromExisting(companyId: string, input: CreateSpecificationFromExistingDto, createdBy: string | null): Promise<Specification> {
    return createSpecificationFromExisting(
      { specifications: this.specifications, workshops: this.workshopPort, products: this.productPort, productVariants: this.productVariantPort },
      {
        companyId,
        sourceSpecificationId: input.sourceSpecificationId,
        createdBy,
        overrideWorkshopId: input.overrideWorkshopId,
        overrideProductId: input.overrideProductId,
        overrideDeliveryDeadline: input.overrideDeliveryDeadline,
        overrideItems: input.overrideItems,
      },
    );
  }

  // Резолвер Order ↔ Specification (ПРОМПТ №3, раздел 9) — единственная
  // точка, знающая про ОБЕ независимые связи: LEGACY (production_orders.specification_id,
  // спецификация первична, 1:N) и NEW (specifications.production_order_id,
  // заказ первичен, 1:1). Каждая пара пишется ровно одним потоком — это не
  // две конкурирующие истины, а два физически разных происхождения; резолвер
  // просто не дублирует эту проверку в каждом вызывающем месте.
  async resolveOrderSpecificationLink(companyId: string, order: ProductionOrder): Promise<Specification | null> {
    const newFlowSpec = await this.specifications.findByProductionOrderId(companyId, order.id);
    if (newFlowSpec) return newFlowSpec;
    if (order.specificationId) {
      return this.specifications.findById(companyId, order.specificationId);
    }
    return null;
  }

  // Создание спецификации ИЗ уже существующего заказа (ПРОМПТ №3, раздел 4) —
  // единственный вход NEW-потока. Строки/цех/модель/срок поставки берутся из
  // заказа на backend, ничего не передаётся в теле запроса. Цена строки —
  // та же формула, что уже применяется к заказу (rework=0, new=цена строки
  // или цена заказа) — переиспользуется, не дублируется.
  async createFromProductionOrder(companyId: string, productionOrderId: string, createdBy: string | null): Promise<Specification> {
    const order = await this.contractManufacturingService.findProductionOrderById(companyId, productionOrderId);
    if (!order) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: "PRODUCTION_ORDER_NOT_FOUND",
        message: `Заказ пошива ${productionOrderId} не найден`,
      });
    }

    const existingLink = await this.resolveOrderSpecificationLink(companyId, order);
    if (existingLink) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "SPECIFICATION_ALREADY_EXISTS_FOR_ORDER",
        message: "Для этого заказа уже создана спецификация",
      });
    }

    const items = order.variants.map((variant) => {
      const pricing = computeSpecificationLinePricing(order, variant);
      return { productVariantId: variant.productVariantId, quantity: pricing.quantity, unitPrice: pricing.unitPrice };
    });

    const spec = await createSpecificationFromProductionOrder(
      { specifications: this.specifications, workshops: this.workshopPort, products: this.productPort, productVariants: this.productVariantPort },
      {
        companyId,
        productionOrderId: order.id,
        workshopId: order.workshopId,
        productId: order.productId,
        deliveryDeadline: order.dueDate,
        items,
        createdBy,
      },
    );

    await this.auditService.record(companyId, createdBy, "http_api", {
      entityType: "specification",
      entityId: spec.id,
      action: "specification.created_from_production_order",
      afterJson: { productionOrderId: order.id, specNumber: spec.specNumber, totalSum: spec.totalSum },
    });

    return spec;
  }

  // Правка спецификации NEW-потока (ПРОМПТ №3, раздел 4/9) — редактируемый
  // документ, без approve/freeze. НИКОГДА не пишет ничего обратно в заказ
  // (гарантируется на уровне доменного use case — UpdateSpecificationDeps
  // физически не содержит доступа к production_orders).
  async update(companyId: string, specificationId: string, input: UpdateSpecificationDto, updatedBy: string | null): Promise<Specification> {
    const before = await this.findById(companyId, specificationId);
    const spec = await updateSpecification(
      { specifications: this.specifications, workshops: this.workshopPort, productVariants: this.productVariantPort },
      {
        companyId,
        specificationId,
        workshopId: input.workshopId,
        deliveryDeadline: input.deliveryDeadline,
        items: input.items,
      },
    );

    await this.auditService.record(companyId, updatedBy, "http_api", {
      entityType: "specification",
      entityId: spec.id,
      action: "specification.updated",
      beforeJson: { workshopId: before.workshopId, totalSum: before.totalSum, totalQuantity: before.totalQuantity },
      afterJson: { workshopId: spec.workshopId, totalSum: spec.totalSum, totalQuantity: spec.totalQuantity },
    });

    return spec;
  }

  // Отмена — терминальное состояние. NEW-поток: пока не отменена. LEGACY-
  // поток: только пока черновик (см. cancelSpecification в домене).
  async cancel(companyId: string, specificationId: string, cancelledBy: string | null): Promise<Specification> {
    const spec = await cancelSpecification({ specifications: this.specifications }, { companyId, specificationId });

    await this.auditService.record(companyId, cancelledBy, "http_api", {
      entityType: "specification",
      entityId: spec.id,
      action: "specification.cancelled",
      afterJson: { status: spec.status },
    });

    return spec;
  }

  // Утверждение (требование №9) — единственная точка, где спецификация
  // получает номер и замораживает snapshot. Реквизиты цеха/компании/модели
  // читаются здесь, непосредственно перед вызовом домена — ровно то
  // "мгновение", данные которого фиксируются навсегда (requirement №4).
  async approve(companyId: string, specificationId: string): Promise<Specification> {
    const spec = await this.findById(companyId, specificationId);

    const [workshop, product, company] = await Promise.all([
      this.contractManufacturingService.findWorkshopById(companyId, spec.workshopId),
      this.catalogService.findProductById(companyId, spec.productId),
      this.identityService.findCompanyById(companyId),
    ]);
    if (!workshop) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_WORKSHOP_NOT_FOUND", message: `Цех ${spec.workshopId} не найден` });
    }
    if (!product) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_PRODUCT_NOT_FOUND", message: `Модель ${spec.productId} не найдена` });
    }
    if (!company) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_COMPANY_NOT_FOUND", message: `Компания ${companyId} не найдена` });
    }

    const itemLines = await Promise.all(
      spec.items.map(async (item) => {
        const variant = await this.catalogService.findProductVariantById(companyId, item.productVariantId);
        if (!variant) {
          // Не должно случиться — FK product_variant_id гарантирует
          // существование строки; явная ошибка лучше, чем тихий undefined
          // в снимке.
          throw new NotFoundException({
            statusCode: HttpStatus.NOT_FOUND,
            code: "SPECIFICATION_VARIANT_NOT_FOUND",
            message: `Вариант ${item.productVariantId} не найден`,
          });
        }
        // Перенос строки, не запятая, между названием модели и цветом
        // (ПРОМПТ №11.4, владелец проекта, 2026-09-19: эталон ВСЕГДА
        // переносит цвет на отдельную строку ячейки "Товары", а не
        // автоматическим переносом по ширине запятой — pdf-lib-template-
        // renderer.ts теперь разбивает значение по "\n" так же, как шапку).
        return { productVariantId: item.productVariantId, name: `${product.name}\n${variant.color}`, unit: "шт", size: variant.size };
      }),
    );

    return approveSpecification(
      { specifications: this.specifications, workshops: this.workshopPort },
      {
        companyId,
        specificationId,
        product: { name: product.name, code: product.code },
        workshop: {
          name: workshop.name,
          contractNumber: workshop.contractNumber,
          contractDate: workshop.contractDate,
          paymentTerms: workshop.paymentTerms,
          deliveryMethod: workshop.deliveryMethod,
          // Юр.адрес цеха («Производитель» в эталонном PDF, ПРОМПТ №2.2/№3) —
          // существующая сущность workshop (workshops.legal_address).
          legalAddress: workshop.legalAddress,
          signerRole: workshop.signerRole,
          signerName: workshop.signerName,
        },
        company: { legalName: company.legalName ?? company.name, signerName: company.signerName },
        itemLines,
      },
    );
  }

  // Сколько из каждой строки спецификации уже размещено производственными
  // партиями (Этап 3 «Production Master», владелец проекта, 2026-09-12) —
  // 1 спецификация → N партий, в т.ч. частичных. Отменённые партии (status
  // "cancelled") не занимают остаток — их количество считается никогда не
  // размещённым.
  private async computeAllocatedByVariant(companyId: string, specificationId: string): Promise<Map<string, number>> {
    const existingOrders = await this.contractManufacturingService.listProductionOrdersBySpecification(
      companyId,
      specificationId,
    );
    const allocated = new Map<string, number>();
    for (const order of existingOrders) {
      if (order.status === "cancelled") continue;
      for (const variant of order.variants) {
        allocated.set(variant.productVariantId, (allocated.get(variant.productVariantId) ?? 0) + Number(variant.quantity));
      }
    }
    return allocated;
  }

  // Остаток спецификации по строкам (Этап 3) — сколько ещё можно разместить
  // партиями. Все расчёты backend (frontend не считает ничего критичного).
  async getAvailableQuantity(companyId: string, specificationId: string): Promise<SpecificationAvailableQuantityResponseDto> {
    const spec = await this.findById(companyId, specificationId);
    const allocatedByVariant = await this.computeAllocatedByVariant(companyId, specificationId);

    const items = await Promise.all(
      spec.items.map(async (item) => {
        const variant = await this.catalogService.findProductVariantById(companyId, item.productVariantId);
        const specifiedQuantity = Number(item.quantity);
        const allocatedQuantity = allocatedByVariant.get(item.productVariantId) ?? 0;
        return {
          productVariantId: item.productVariantId,
          size: variant?.size ?? "",
          color: variant?.color ?? "",
          unitPrice: Number(item.unitPrice),
          specifiedQuantity,
          allocatedQuantity,
          availableQuantity: Math.max(0, specifiedQuantity - allocatedQuantity),
        };
      }),
    );
    return { items };
  }

  // Создание производственной партии из утверждённой спецификации (Этап 3
  // «Production Master», владелец проекта, 2026-09-12) — auto-confirm:
  // партия создаётся сразу в статусе "placed" с готовым cost_snapshot,
  // отдельного шага "Подтвердить" для этого сценария нет.
  //
  // Вариант B (владелец проекта, требование №7): коммерческие поля
  // cost_snapshot (реквизиты договора/подписанты/условия оплаты) берутся из
  // ЗАМОРОЖЕННОГО snapshotJson спецификации, а не из живых workshop/company —
  // изменение реквизитов после утверждения спецификации не должно повлиять
  // на партию. Технологические/себестоимостные поля (нормы расхода, цены
  // материалов) — существующим CostingService из approved BOM на момент
  // создания партии (тот же путь, что и в ProductionOrderOrchestrationService.confirmProductionOrder).
  async createProductionOrder(
    companyId: string,
    specificationId: string,
    input: CreateProductionOrderFromSpecificationDto,
    createdBy: string | null,
  ): Promise<ProductionOrder> {
    const spec = await this.findById(companyId, specificationId);
    if (spec.status !== "approved" || !spec.snapshotJson) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "SPECIFICATION_NOT_APPROVED",
        message: "Производственную партию можно создать только из утверждённой спецификации",
      });
    }
    const snapshot = spec.snapshotJson as unknown as SpecificationSnapshot;

    const allocatedByVariant = await this.computeAllocatedByVariant(companyId, specificationId);
    const availableByVariant = new Map<string, number>();
    for (const item of spec.items) {
      const allocated = allocatedByVariant.get(item.productVariantId) ?? 0;
      availableByVariant.set(item.productVariantId, Number(item.quantity) - allocated);
    }

    let requestedLines: Array<{ productVariantId: string; quantity: number }>;
    if (input.items && input.items.length > 0) {
      for (const line of input.items) {
        const available = availableByVariant.get(line.productVariantId);
        if (available === undefined) {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            code: "SPECIFICATION_ITEM_NOT_FOUND",
            message: `Строка ${line.productVariantId} не входит в эту спецификацию`,
          });
        }
        if (line.quantity - available > 0.0005) {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            code: "SPECIFICATION_QUANTITY_EXCEEDS_AVAILABLE",
            message: `Запрошенное количество (${line.quantity}) превышает доступный остаток спецификации (${available})`,
          });
        }
      }
      requestedLines = input.items;
    } else {
      // Ничего не передано — берём всё доступное количество по каждой строке
      // (минимум кликов, принцип 17).
      requestedLines = [...availableByVariant.entries()]
        .filter(([, quantity]) => quantity > 0.0005)
        .map(([productVariantId, quantity]) => ({ productVariantId, quantity }));
    }

    if (requestedLines.length === 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "SPECIFICATION_FULLY_ALLOCATED",
        message: "Спецификация уже полностью размещена в производственных партиях",
      });
    }

    // ensureApproved — не getApproved+throw (см. комментарий в BomService):
    // этот путь обязан вести себя так же, как прямой POST /production-orders,
    // а не требовать от пользователя заранее сходить в карточку модели за
    // BOM, о котором мастер спецификации нигде не предупреждал.
    const bom = await this.bomService.ensureApproved(companyId, spec.productId, createdBy);

    const itemByVariant = new Map(spec.items.map((item) => [item.productVariantId, item]));
    const variants: ProductionOrderVariantDraft[] = requestedLines.map((line) => {
      const item = itemByVariant.get(line.productVariantId);
      return {
        productVariantId: line.productVariantId,
        quantity: line.quantity,
        variantType: "new",
        unitPrice: item ? Number(item.unitPrice) : undefined,
      };
    });
    const plannedQuantity = variants.reduce((sum, variant) => sum + variant.quantity, 0);
    const totalSum = variants.reduce((sum, variant) => sum + variant.quantity * (variant.unitPrice ?? 0), 0);
    // Цена заказа — средневзвешенная по фактически размещаемым строкам этой
    // партии (не всей спецификации): справочное значение, реальная цена
    // каждой строки уже зафиксирована явно в variants[].unitPrice.
    const agreedUnitPrice = plannedQuantity > 0 ? totalSum / plannedQuantity : 0;

    const [pricing, materialNorms, materialNormsVersion, orderNumber] = await Promise.all([
      this.costingService.computeSpecificationPricing(companyId, spec.productId),
      this.costingService.captureMaterialNorms(companyId, spec.productId),
      this.costingService.findApprovedBomVersion(companyId, spec.productId),
      this.identityService.reserveNextProductionOrderNumber(companyId),
    ]);

    const costSnapshot: ProductionOrderCostSnapshot = {
      capturedAt: new Date().toISOString(),
      materialNorms,
      ...(materialNormsVersion !== null ? { materialNormsVersion } : {}),
      agreedUnitPrice,
      agreedUnitPriceCurrency: "RUB",
      fabricCostPerUnit: pricing.fabricCostPerUnit,
      trimCostPerUnit: pricing.trimCostPerUnit,
      packagingCostPerUnit: pricing.packagingCostPerUnit,
      sewingCostPerUnit: pricing.sewingCostPerUnit,
      otherCostPerUnit: pricing.otherCostPerUnit,
      materialCostsByCurrency: pricing.materialCostsByCurrency,
      actualCostPerUnit: pricing.actualCostPerUnit,
      actualCostCurrency: pricing.actualCostCurrency,
      currencyWarning: pricing.currencyWarning,
      deductionPerUnit: pricing.deductionPerUnit,
      specificationPricePerUnit: pricing.specificationPricePerUnit,
      materialsWithoutPriceHistory: pricing.materialsWithoutPriceHistory,
      // Вариант B — коммерческие поля из snapshot спецификации, НЕ из живых
      // workshop/company (требование №7): реквизиты, изменённые после
      // утверждения спецификации, не должны повлиять на партию.
      paymentTerms: snapshot.workshop.paymentTerms ?? formatDefaultPaymentTerms(totalSum),
      deliveryMethod: snapshot.workshop.deliveryMethod ?? "",
      contractNumber: snapshot.workshop.contractNumber ?? "",
      contractDate: snapshot.workshop.contractDate ?? "",
      contractorName: snapshot.workshop.name,
      customerName: snapshot.company.legalName,
      contractorSignerRole: snapshot.workshop.signerRole ?? "",
      contractorSignerName: snapshot.workshop.signerName ?? "",
      customerSignerName: snapshot.company.signerName ?? "",
    };

    const order = await this.contractManufacturingService.createProductionOrderFromSpecification(companyId, {
      productId: spec.productId,
      bomId: bom.id,
      workshopId: spec.workshopId,
      plannedQuantity,
      agreedUnitPrice,
      dueDate: spec.deliveryDeadline,
      variants,
      createdBy,
      specificationId: spec.id,
      orderNumber,
      costSnapshot,
    });

    await this.auditService.record(companyId, createdBy, "http_api", {
      entityType: "production_order",
      entityId: order.id,
      action: "production_order.created_from_specification",
      afterJson: {
        specificationId: spec.id,
        specNumber: spec.specNumber,
        orderNumber,
        plannedQuantity,
        variants: variants.map((variant) => ({ productVariantId: variant.productVariantId, quantity: variant.quantity })),
      },
    });

    return order;
  }

  async findById(companyId: string, id: string): Promise<Specification> {
    const spec = await this.specifications.findById(companyId, id);
    if (!spec) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_NOT_FOUND", message: `Спецификация ${id} не найдена` });
    }
    return spec;
  }

  async listByCompany(
    companyId: string,
    filter?: { productId?: string; workshopId?: string; status?: SpecificationStatus },
  ): Promise<Specification[]> {
    return this.specifications.listByCompany(companyId, filter);
  }

  // Дата спецификации (ПРОМПТ №3, раздел 7: "должна быть определена
  // однозначно") — дата создания, никогда не меняется правкой (updatedAt
  // здесь намеренно не используется).
  private formatSpecDate(spec: Specification): string {
    return formatRuDate(spec.createdAt.toISOString().slice(0, 10));
  }

  // PDF (требование №16 legacy / ПРОМПТ №3 раздел 6 NEW) — источник данных
  // зависит от потока: LEGACY читает строго замороженный snapshotJson (не
  // живые product/workshop/company — повторная генерация через месяц с теми
  // же данными снимка даёт идентичный документ, даже если модель/цех/
  // компания успели измениться); NEW-поток снимка не имеет вовсе
  // (ПРОМПТ №3: "PDF собирается из ТЕКУЩЕГО состояния Specification") и
  // собирает данные из живых Workshop/Product/Company + текущих строк
  // спецификации. Оба используют один и тот же Document Template Engine и
  // один и тот же эталонный шаблон (docs/DOCUMENT_ENGINE_ARCHITECTURE.md).
  async generateDocument(companyId: string, specificationId: string, uploadedBy: string | null): Promise<AttachDocumentResult> {
    const spec = await this.findById(companyId, specificationId);

    if (spec.productionOrderId) {
      return this.generateDocumentForNewFlow(companyId, spec, uploadedBy);
    }

    if (spec.status !== "approved" || !spec.snapshotJson) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "SPECIFICATION_NOT_APPROVED",
        message: "PDF можно сформировать только для утверждённой спецификации",
      });
    }
    const snapshot = spec.snapshotJson as unknown as SpecificationSnapshot;
    const totalSum = Number(snapshot.totals.sum);

    const data: SpecificationDocumentData = {
      fields: {
        contractNumber: snapshot.workshop.contractNumber ?? "",
        contractDate: formatRuDate(snapshot.workshop.contractDate),
        specDate: this.formatSpecDate(spec),
        customerName: snapshot.company.legalName,
        contractorName: snapshot.workshop.name,
        specNumber: String(spec.specNumber ?? ""),
        paymentTerms: snapshot.workshop.paymentTerms ?? formatDefaultPaymentTerms(totalSum),
        deliveryDeadline: formatDeliveryPeriodText(snapshot.deliveryDeadline, String(spec.createdAt.getFullYear())),
        deliveryMethod: snapshot.workshop.deliveryMethod ?? "",
        legalAddress: snapshot.workshop.legalAddress ?? "",
        contractorSignerRole: snapshot.workshop.signerRole ?? "",
        contractorSignerName: snapshot.workshop.signerName ?? "",
        customerSignerName: snapshot.company.signerName ?? "",
        totalSumNoDecimals: formatRuAmountNoDecimals(totalSum),
      },
      items: snapshot.items.map((item) => ({
        name: item.name,
        unit: item.unit,
        size: item.size,
        quantity: formatRuQuantity(Number(item.quantity)),
        unitPrice: formatRuAmount(Number(item.unitPrice)),
        sum: formatRuAmount(Number(item.sum)),
      })),
      totals: {
        quantity: formatRuQuantityNoGrouping(Number(snapshot.totals.quantity)),
        sum: formatRuAmount(Number(snapshot.totals.sum)),
      },
    };

    return this.documentService.generateSpecificationForSpecification(companyId, specificationId, uploadedBy, data);
  }

  // NEW-поток (ПРОМПТ №3, раздел 6) — без snapshotJson: собирает данные из
  // ТЕКУЩЕГО состояния спецификации и живых Workshop/Product/Company.
  // Регенерация после правки специально даёт другой PDF — это и есть
  // "PDF = версия конкретного состояния Specification" (ПРОМПТ №2.1, п.6);
  // предыдущая версия документа не удаляется (supersedesDocumentId,
  // Immutable Original — docs/PRINCIPLES.md, принцип 19).
  private async generateDocumentForNewFlow(companyId: string, spec: Specification, uploadedBy: string | null): Promise<AttachDocumentResult> {
    if (spec.status === "cancelled") {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        code: "SPECIFICATION_CANCELLED",
        message: "PDF нельзя сформировать для отменённой спецификации",
      });
    }

    const [workshop, product, company] = await Promise.all([
      this.contractManufacturingService.findWorkshopById(companyId, spec.workshopId),
      this.catalogService.findProductById(companyId, spec.productId),
      this.identityService.findCompanyById(companyId),
    ]);
    if (!workshop) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_WORKSHOP_NOT_FOUND", message: `Цех ${spec.workshopId} не найден` });
    }
    if (!product) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_PRODUCT_NOT_FOUND", message: `Модель ${spec.productId} не найдена` });
    }
    if (!company) {
      throw new NotFoundException({ statusCode: HttpStatus.NOT_FOUND, code: "SPECIFICATION_COMPANY_NOT_FOUND", message: `Компания ${companyId} не найдена` });
    }

    const customerName = company.legalName ?? company.name;

    const items = await Promise.all(
      spec.items.map(async (item) => {
        const variant = await this.catalogService.findProductVariantById(companyId, item.productVariantId);
        if (!variant) {
          throw new NotFoundException({
            statusCode: HttpStatus.NOT_FOUND,
            code: "SPECIFICATION_VARIANT_NOT_FOUND",
            message: `Вариант ${item.productVariantId} не найден`,
          });
        }
        return {
          // См. комментарий у аналогичной строки в approveSpecification выше
          // (ПРОМПТ №11.4) — перенос строки вместо запятой перед цветом.
          name: `${product.name}\n${variant.color}`,
          unit: "шт",
          size: variant.size,
          quantity: formatRuQuantity(Number(item.quantity)),
          unitPrice: formatRuAmount(Number(item.unitPrice)),
          sum: formatRuAmount(Number(item.sum)),
        };
      }),
    );

    const data: SpecificationDocumentData = {
      fields: {
        contractNumber: workshop.contractNumber ?? "",
        contractDate: formatRuDate(workshop.contractDate),
        specDate: this.formatSpecDate(spec),
        customerName,
        contractorName: workshop.name,
        specNumber: String(spec.specNumber ?? ""),
        paymentTerms: workshop.paymentTerms ?? formatDefaultPaymentTerms(Number(spec.totalSum)),
        deliveryDeadline: formatDeliveryPeriodText(spec.deliveryDeadline, String(spec.createdAt.getFullYear())),
        deliveryMethod: workshop.deliveryMethod ?? "",
        legalAddress: workshop.legalAddress ?? "",
        contractorSignerRole: workshop.signerRole ?? "",
        contractorSignerName: workshop.signerName ?? "",
        customerSignerName: company.signerName ?? "",
        totalSumNoDecimals: formatRuAmountNoDecimals(Number(spec.totalSum)),
      },
      items,
      totals: {
        quantity: formatRuQuantityNoGrouping(Number(spec.totalQuantity)),
        sum: formatRuAmount(Number(spec.totalSum)),
      },
    };

    return this.documentService.generateSpecificationForSpecification(companyId, spec.id, uploadedBy, data);
  }
}
