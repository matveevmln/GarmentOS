import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PurchaseOrderItemDraft } from "@garmentos/domain-procurement";
import type {
  ConfirmDocumentRequestDto,
  ConfirmDocumentResponseDto,
  ExtractDocumentRequestDto,
  ExtractDocumentResponseDto,
} from "@garmentos/shared-types";
import type { AIClassifier } from "../ai-production-assistant/ai-classifier";
import { AI_CLASSIFIER } from "../ai-production-assistant/ai-production-assistant.tokens";
import type { AuthenticatedRequestUser } from "../auth/current-user.decorator";
import { AuditService } from "../audit/audit.service";
import { DocumentService } from "../document/document.service";
import { ProcurementService } from "../procurement/procurement.service";
import { computeDocumentReconciliation } from "./reconciliation";
import { findEntityMatches } from "./entity-matching";

// Оркестрация без собственной бизнес-логики (P6, владелец проекта,
// 2026-09-06) — тот же принцип, что и ProductionOrderOrchestrationService:
// сам сервис не проверяет доменные инварианты и не пишет ни одной таблицы
// напрямую, только вызывает уже существующие use case'ы Materials &
// Procurement (через ProcurementService) и Document Engine (через
// DocumentService) в правильном порядке.
//
// СТРОГОЕ РАЗДЕЛЕНИЕ (архитектурное правило задания): extract() не пишет
// ничего, кроме самого предложения (document_derivatives) — ни материала, ни
// поставщика, ни закупки. Единственный метод, вызывающий детерминированные
// доменные use case'ы, — confirm(), и делает это только после того, как
// оператор явно передал подтверждённые (возможно, отредактированные)
// значения. AI никогда не вызывается из confirm().
@Injectable()
export class DocumentIntelligenceService {
  constructor(
    @Inject(AI_CLASSIFIER) private readonly aiClassifier: AIClassifier,
    private readonly documentService: DocumentService,
    private readonly procurementService: ProcurementService,
    private readonly auditService: AuditService,
  ) {}

  // Шаг 1-4 задания: вставка/загрузка → извлечение → показ оператору с
  // предложенными совпадениями и сверкой. Ничего из результата ещё не
  // является канонической бизнес-записью.
  async extract(currentUser: AuthenticatedRequestUser, input: ExtractDocumentRequestDto): Promise<ExtractDocumentResponseDto> {
    const companyId = currentUser.companyId;

    let documentId = input.documentId;
    if (documentId) {
      const existing = await this.documentService.findById(companyId, documentId);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: "DOCUMENT_NOT_FOUND",
          message: `Документ ${documentId} не найден`,
        });
      }
    } else {
      // П6.1.B — вставленный текст без файла сохраняется как обычный
      // документ через уже существующий Document Engine (не второе
      // хранилище). Привязывается к компании как временный "дом" — при
      // подтверждении (confirm) появится настоящая связь с материалом/
      // закупкой (document_links).
      const uploaded = await this.documentService.upload({
        companyId,
        docType: input.documentType,
        fileName: `${input.documentType}-${Date.now()}.txt`,
        data: Buffer.from(input.text, "utf-8"),
        entityType: "company",
        entityId: companyId,
        uploadedBy: currentUser.id,
      });
      documentId = uploaded.document.id;
    }

    // AI — только извлекает и предлагает, ничего не пишет в канонические
    // таблицы (procurement/warehouse). Ошибка AI (невалидный JSON, сеть,
    // отсутствующий ключ) не должна и не может создать документ дважды —
    // документ уже сохранён выше независимо от исхода извлечения.
    const extracted = await this.aiClassifier.extractDocumentFields(input.documentType, input.text);

    // Повторное извлечение по тому же документу создаёт НОВУЮ запись
    // (DocumentDerivativeRepository.create — insert-only, update отсутствует
    // как метод порта) — предыдущее извлечение не переписывается.
    const derivative = await this.documentService.createDerivative({
      documentId,
      type: "structured_data",
      content: extracted,
      generatedBy: "document-intelligence:anthropic",
    });

    const [materials, suppliers] = await Promise.all([
      this.procurementService.listMaterials(companyId),
      this.procurementService.listSuppliers(companyId),
    ]);

    const supplierMatches = extracted.supplierName ? findEntityMatches(suppliers, extracted.supplierName) : [];
    const materialMatches = extracted.lines.map((line) => findEntityMatches(materials, line.description));
    const reconciliation = computeDocumentReconciliation(extracted);

    return { documentId, derivativeId: derivative.id, extracted, supplierMatches, materialMatches, reconciliation };
  }

  // Шаг 5-9 задания: подтверждённые оператором значения → существующие
  // детерминированные use case'ы Materials & Procurement → document_links →
  // audit. Это единственное место во всём P6, где создаются/меняются
  // канонические бизнес-записи.
  async confirm(currentUser: AuthenticatedRequestUser, input: ConfirmDocumentRequestDto): Promise<ConfirmDocumentResponseDto> {
    const companyId = currentUser.companyId;
    const document = await this.documentService.findById(companyId, input.documentId);
    if (!document) {
      throw new NotFoundException({
        statusCode: 404,
        code: "DOCUMENT_NOT_FOUND",
        message: `Документ ${input.documentId} не найден`,
      });
    }

    // Поставщик — обязателен, только если создаётся новая закупка (обычно
    // инвойс); у пакинг-листа, привязываемого к уже существующей закупке,
    // отдельного поставщика указывать не нужно.
    let supplierId: string | null = null;
    if (input.supplier) {
      if ("id" in input.supplier) {
        const supplier = await this.procurementService.findSupplierById(companyId, input.supplier.id);
        if (!supplier) {
          throw new NotFoundException({
            statusCode: 404,
            code: "SUPPLIER_NOT_FOUND",
            message: `Поставщик ${input.supplier.id} не найден`,
          });
        }
        supplierId = supplier.id;
      } else {
        const created = await this.procurementService.createSupplier(companyId, {
          name: input.supplier.name,
          type: input.supplier.type ?? "fabric",
        });
        supplierId = created.id;
      }
    }

    // Материалы по строкам — существующая карточка переиспользуется как есть,
    // новая создаётся через тот же createMaterial, что и ручной ввод на
    // странице "Материалы" (никакой отдельной бизнес-логики здесь нет).
    const materialIds: string[] = [];
    const purchaseOrderItems: PurchaseOrderItemDraft[] = [];
    for (const line of input.lines) {
      let materialId: string;
      if ("id" in line.material) {
        const material = await this.procurementService.findMaterialById(companyId, line.material.id);
        if (!material) {
          throw new NotFoundException({
            statusCode: 404,
            code: "MATERIAL_NOT_FOUND",
            message: `Материал ${line.material.id} не найден`,
          });
        }
        materialId = material.id;
      } else {
        const created = await this.procurementService.createMaterial(companyId, {
          name: line.material.name,
          type: line.material.type,
          unit: line.material.unit,
        });
        materialId = created.id;
      }
      materialIds.push(materialId);
      purchaseOrderItems.push({ materialId, quantity: line.quantity, unitPrice: line.unitPrice ?? 0 });
    }

    // Закупка — либо переиспользуется существующая (пакинг-лист, обычно
    // ссылающийся на закупку, уже созданную по инвойсу), либо создаётся новая
    // (инвойс). Ни то, ни другое не дублирует createPurchaseOrderDraft —
    // просто вызывает его или пропускает.
    let purchaseOrderId: string;
    if (input.purchaseOrder) {
      const existing = await this.procurementService.findPurchaseOrderById(companyId, input.purchaseOrder.id);
      if (!existing) {
        throw new NotFoundException({
          statusCode: 404,
          code: "PURCHASE_ORDER_NOT_FOUND",
          message: `Закупка ${input.purchaseOrder.id} не найдена`,
        });
      }
      purchaseOrderId = existing.id;
    } else {
      if (!supplierId) {
        throw new NotFoundException({
          statusCode: 400,
          code: "DOCUMENT_INTELLIGENCE_SUPPLIER_REQUIRED",
          message: "Для новой закупки нужно указать поставщика",
        });
      }
      const created = await this.procurementService.createPurchaseOrderDraft(companyId, {
        supplierId,
        items: purchaseOrderItems,
        currency: input.currency,
        orderedAt: input.orderedAt,
      });
      purchaseOrderId = created.id;
    }

    // document_links — связи с уже реальными сущностями, не с предложением
    // AI. confidence отражает, принял ли оператор предложение AI как есть
    // (высокая уверенность) или сделал выбор/ввод сам (без числовой оценки —
    // это не AI-решение, оценивать нечего).
    const linkedBy = currentUser.id;
    for (const [index, line] of input.lines.entries()) {
      await this.documentService.link({
        companyId,
        documentId: input.documentId,
        entityType: "material",
        entityId: materialIds[index],
        confidence: line.matchSource === "ai" ? "0.80" : null,
        source: line.matchSource,
        linkedBy,
      });
    }
    await this.documentService.link({
      companyId,
      documentId: input.documentId,
      entityType: "purchase_order",
      entityId: purchaseOrderId,
      confidence: null,
      source: "manual",
      linkedBy,
    });
    if (supplierId && input.supplier && !("id" in input.supplier)) {
      await this.documentService.link({
        companyId,
        documentId: input.documentId,
        entityType: "supplier",
        entityId: supplierId,
        confidence: input.supplierMatchSource === "ai" ? "0.80" : null,
        source: input.supplierMatchSource ?? "manual",
        linkedBy,
      });
    }

    await this.auditService.recordForUser(currentUser, {
      entityType: "purchase_order",
      entityId: purchaseOrderId,
      action: "document_intelligence.confirmed",
      afterJson: {
        documentId: input.documentId,
        documentType: input.documentType,
        supplierId,
        materialIds,
        lines: input.lines,
      },
    });

    return { supplierId, purchaseOrderId, materialIds };
  }
}
