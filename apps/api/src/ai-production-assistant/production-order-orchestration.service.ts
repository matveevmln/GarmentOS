import { Inject, Injectable } from "@nestjs/common";
import type { ProductionOrder } from "@garmentos/domain-contract-manufacturing";
import type { DocumentEntity, SpecificationDocumentData, SpecificationLineItem } from "@garmentos/domain-document";
import { BomService } from "../bom/bom.service";
import { CatalogService } from "../catalog/catalog.service";
import { ContractManufacturingService } from "../contract-manufacturing/contract-manufacturing.service";
import { DocumentService } from "../document/document.service";
import { IdentityService } from "../identity/identity.service";
import type { TelegramClient } from "../telegram/telegram-client";
import { TELEGRAM_CLIENT } from "../telegram/telegram.tokens";
import { ProductionRequestService } from "./production-request.service";
import { formatRuAmount, formatRuQuantity } from "./ru-number-format";

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

// Оркестрация вертикального сценария Итерации 7 (docs/ROADMAP.md): текст →
// разбор (AIClassifier) → резолв модели/BOM/SKU из каталога (уже
// существующих — AI не придумывает недостающее, только сообщает) →
// черновик заказа пошива; и отдельно — подтверждённый заказ → генерация
// спецификации по шаблону → отправка цеху в Telegram, если чат привязан.
// Сама оркестрация не доменная логика — каждый шаг делегирован
// существующему application-сервису соответствующего модуля.
@Injectable()
export class ProductionOrderOrchestrationService {
  constructor(
    private readonly productionRequestService: ProductionRequestService,
    private readonly catalogService: CatalogService,
    private readonly bomService: BomService,
    private readonly contractManufacturingService: ContractManufacturingService,
    private readonly documentService: DocumentService,
    private readonly identityService: IdentityService,
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

    // Условия оплаты/способ доставки не моделируются как отдельная сущность
    // сегодня — оставлены пустыми до появления соответствующих полей у
    // заказа/договора, не изобретаются.
    const data: SpecificationDocumentData = {
      fields: {
        contractNumber: workshop.contractNumber ?? "",
        contractDate: workshop.contractDate ?? "",
        customerName: company.legalName ?? company.name,
        contractorName: workshop.name,
        specNumber: String(specNumber),
        paymentTerms: "",
        deliveryDeadline: order.dueDate ?? "",
        deliveryMethod: "",
        contractorSignerRole: "",
        contractorSignerName: "",
        customerSignerName: "",
      },
      items,
      totals: { quantity: formatRuQuantity(totalQuantity), sum: formatRuAmount(totalSum) },
    };

    const result = await this.documentService.generateSpecification(companyId, productionOrderId, uploadedBy, data);

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
