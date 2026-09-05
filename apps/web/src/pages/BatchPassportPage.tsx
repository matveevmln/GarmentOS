import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  BatchPassportResponseDto,
  CuttingFactResponseDto,
  CuttingOrderResponseDto,
  DocumentResponseDto,
  WarehouseResponseDto,
} from "@garmentos/shared-types";
import { apiDownload, apiRequest, apiUpload, ApiError } from "../api/client";
import { Card, CardTitle, SectionLabel } from "../design-system/Card/Card";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Button } from "../design-system/Button/Button";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { IconAlert } from "../design-system/Icons/icons";
import {
  Accordion,
  CostBreakdown,
  DocumentRow,
  MoneyBlock,
  ProductionStepper,
  Timeline,
  type CuttingStageState,
  isProductionStage,
  type CostRow,
} from "../design-system/Blocks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../design-system/Modal/Dialog";
import { Upload } from "../design-system/Upload/Upload";
import { Field } from "../design-system/Form/Field";
import { Input } from "../design-system/Input/Input";
import { NumberInput } from "../design-system/Input/NumberInput";
import { DatePicker } from "../design-system/Form/DatePicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { statusMeta } from "../lib/status";
import { formatDate, formatMoney, formatQuantity, materialTypeLabel, unitLabel } from "../lib/format";
import { cn } from "../design-system/utils";
import { toast } from "../design-system/Toast/Toast";

// «Паспорт партии» — центральный экран заказа пошива.
//
// Композиция перенесена из GitHub-прототипа (`matveevmln/garmentos-ea4078f2`,
// PassportScreen) — единого источника визуальной истины
// (docs/UI_MIGRATION_PLAN.md §0, этап 5): шапка с хлебными крошками →
// тёмная полоса идентичности → деньги + «требует внимания» →
// производственная шкала → детали (табы на десктопе, аккордеоны на
// мобильном).
//
// Данные и действия — только реальные, из `GET /production-orders/:id/passport`
// и `GET /documents/:id/file`. Mock-файл прототипа не используется, новых
// метрик и статусов не вводится.
//
// Три раздела (Материалы/ОТК/Логистика) остаются честными пустыми
// состояниями: агрегировать их не из чего, пока не утверждены разделы
// 16/4/22 docs/PRODUCTION_BATCH_LIFECYCLE_ARCHITECTURE.md. В прототипе им
// соответствия нет, поэтому они показаны отдельными карточками через
// перенесённый EmptyState, а не выдуманной вкладкой с нулями.

type TabKey = "cost" | "materials" | "cutting" | "docs" | "colors" | "contract" | "history";

// Тип документа хранится в базе строкой (`documents.doc_type`) и намеренно не
// ограничен списком: у каждой компании свой словарь документов. В интерфейсе
// известные типы получают русское название, незнакомые показываются как есть,
// а не прячутся — иначе загруженный документ выглядел бы безымянным.
const DOC_TYPE_LABELS: Record<string, string> = {
  specification: "Спецификация",
  specification_signed: "Подписанная спецификация",
  cutting_order: "Раскройное задание",
  invoice: "Счёт",
  contract: "Договор",
  act: "Акт",
  waybill: "Накладная",
  photo: "Фото",
  other: "Другое",
};

const CUTTING_STATUS_LABELS: Record<string, string> = {
  draft: "черновик",
  issued: "в крое",
  completed: "крой завершён",
  cancelled: "отменено",
};

function documentTypeLabel(docType: string): string {
  return DOC_TYPE_LABELS[docType] ?? docType;
}

// Типы, которые предлагаются при загрузке. Список — подсказка, а не
// ограничение: в базе тип остаётся свободной строкой, потому что словарь
// документов у каждой компании свой.
const UPLOADABLE_DOC_TYPES = [
  "specification_signed",
  "invoice",
  "contract",
  "act",
  "waybill",
  "photo",
  "other",
] as const;

const TABS: { key: TabKey; label: string }[] = [
  { key: "cost", label: "Себестоимость" },
  { key: "materials", label: "Нормы расхода материалов" },
  { key: "cutting", label: "Раскрой" },
  { key: "docs", label: "Документы" },
  { key: "colors", label: "Размеры и цвета" },
  { key: "contract", label: "Договор" },
  { key: "history", label: "История" },
];


export function BatchPassportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [passport, setPassport] = useState<BatchPassportResponseDto | null>(null);
  const [error, setError] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [tab, setTab] = useState<TabKey>("cost");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadDocType, setUploadDocType] = useState<string>("specification_signed");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadIssuedAt, setUploadIssuedAt] = useState<Date | undefined>(undefined);
  const [isUploading, setIsUploading] = useState(false);
  // Раскрой — отдельная сущность со своим состоянием; статус заказа она не
  // меняет (владелец проекта, 2026-08-30).
  const [cuttingOrders, setCuttingOrders] = useState<CuttingOrderResponseDto[]>([]);
  const [cuttingBusy, setCuttingBusy] = useState(false);
  const [factWarehouse, setFactWarehouse] = useState("");
  const [warehouses, setWarehouses] = useState<WarehouseResponseDto[]>([]);
  const [allocations, setAllocations] = useState<Record<string, number | undefined>>({});
  const [rollNotes, setRollNotes] = useState<Record<string, string>>({});
  const [consumed, setConsumed] = useState<Record<string, number | undefined>>({});
  const [actuals, setActuals] = useState<Record<string, number | undefined>>({});
  const [shortages, setShortages] = useState<CuttingFactResponseDto["shortages"]>([]);

  const load = () => {
    if (!id) return;
    setError(false);
    apiRequest<BatchPassportResponseDto>(`/production-orders/${id}/passport`)
      .then(setPassport)
      .catch(() => setError(true));
  };

  const loadCutting = () => {
    if (!id) return;
    void apiRequest<CuttingOrderResponseDto[]>(`/production-orders/${id}/cutting-orders`)
      .then(setCuttingOrders)
      .catch(() => setCuttingOrders([]));
  };

  useEffect(load, [id]);
  useEffect(loadCutting, [id]);
  useEffect(() => {
    void apiRequest<WarehouseResponseDto[]>("/warehouses")
      .then((rows) => {
        setWarehouses(rows);
        if (rows.length === 1 && rows[0]) setFactWarehouse(rows[0].id);
      })
      .catch(() => setWarehouses([]));
  }, []);

  // Раскройное задание строится из данных заказа: матрица из его строк,
  // потребность из зафиксированных норм партии. Вводить заново ничего не надо.
  const createCuttingOrder = async () => {
    if (!id) return;
    setCuttingBusy(true);
    try {
      await apiRequest<CuttingOrderResponseDto>(`/production-orders/${id}/cutting-orders`, {
        method: "POST",
        body: {},
      });
      loadCutting();
      toast.success("Раскройное задание создано");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать раскройное задание");
    } finally {
      setCuttingBusy(false);
    }
  };

  const issueCutting = async (cuttingId: string, materials: CuttingOrderResponseDto["materials"]) => {
    setCuttingBusy(true);
    try {
      await apiRequest(`/cutting-orders/${cuttingId}/issue`, {
        method: "POST",
        body: {
          allocations: materials.map((material) => ({
            materialId: material.materialId,
            allocatedQuantity: allocations[material.materialId] ?? material.requiredQuantity,
            rollNote: rollNotes[material.materialId] ?? null,
          })),
        },
      });
      loadCutting();
      toast.success("Задание выдано в крой", { description: "Материал со склада пока не списан" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось выдать задание в крой");
    } finally {
      setCuttingBusy(false);
    }
  };

  const submitFact = async (order: CuttingOrderResponseDto, correction: boolean) => {
    if (!factWarehouse) {
      toast.error("Выберите склад, с которого брали материал");
      return;
    }
    setCuttingBusy(true);
    try {
      const response = await apiRequest<CuttingFactResponseDto>(
        `/cutting-orders/${order.id}/${correction ? "correct" : "result"}`,
        {
          method: "POST",
          body: {
            warehouseId: factWarehouse,
            materials: order.materials.map((material) => ({
              materialId: material.materialId,
              consumedQuantity: consumed[material.materialId] ?? material.consumedQuantity ?? 0,
              rollNote: rollNotes[material.materialId] ?? material.rollNote,
            })),
            results: order.results.map((row) => ({
              productVariantId: row.productVariantId,
              actualQuantity: Math.round(actuals[row.productVariantId] ?? row.actualQuantity ?? row.plannedQuantity),
            })),
          },
        },
      );
      setShortages(response.shortages);
      loadCutting();
      toast.success(correction ? "Факт исправлен" : "Факт кроя внесён", {
        description: correction ? "Разница проведена корректировкой склада" : "Фактический расход списан со склада",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить факт кроя");
    } finally {
      setCuttingBusy(false);
    }
  };

  const generateCuttingDocument = async (cuttingId: string) => {
    setCuttingBusy(true);
    try {
      await apiRequest(`/cutting-orders/${cuttingId}/generate-document`, { method: "POST" });
      load();
      toast.success("Раскройное задание сформировано", { description: "Файл — во вкладке «Документы»" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сформировать документ");
    } finally {
      setCuttingBusy(false);
    }
  };

  // Спецификация формируется существующим механизмом Document Engine —
  // второго генератора не заводится. Номер документа резервируется по
  // договору цеха, реквизиты берутся из зафиксированных данных партии, а не
  // из карточек модели и цеха, которые могли измениться после подтверждения.
  //
  // Повторное формирование не создаёт неучтённых дубликатов: сервер
  // помечает прежнюю спецификацию неактуальной и связывает новую с ней
  // (Document Engine, версионность). Кнопка блокируется на время запроса, а
  // повтор при уже существующем документе требует подтверждения — чтобы
  // номер спецификации не расходовался случайным нажатием.
  const generateSpecification = async () => {
    if (!id) return;
    setIsGenerating(true);
    try {
      const document = await apiRequest<DocumentResponseDto>(`/production-orders/${id}/generate-specification`, {
        method: "POST",
      });
      load();
      toast.success(`Спецификация сформирована`, { description: document.title ?? undefined });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сформировать спецификацию");
    } finally {
      setIsGenerating(false);
      setConfirmRegenerate(false);
    }
  };

  // P0-1 (владелец проекта, 2026-09-05) — переходы «Размещён» → «В работе» →
  // «Готово к отгрузке», которые сегодня приходят только через Telegram-ответ
  // цеха. Единственный способ провести партию дальше из интерфейса, пока
  // Telegram не настроен ни для одного цеха на пилоте.
  const changeOrderStatus = async (status: "in_progress" | "ready_for_pickup") => {
    if (!id) return;
    setIsChangingStatus(true);
    try {
      await apiRequest(`/production-orders/${id}/status`, { method: "POST", body: { status } });
      load();
      toast.success(status === "in_progress" ? "Заказ переведён «В работе»" : "Заказ переведён «Готово к отгрузке»");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сменить статус заказа");
    } finally {
      setIsChangingStatus(false);
    }
  };

  // Загрузка документа, пришедшего извне: подписанная спецификация, счёт,
  // накладная. Файл уходит в хранилище, запись — в базу, связь — с этой
  // партией. Содержимое файла данные партии не меняет: документ ложится
  // рядом с ними, а не поверх.
  const uploadDocument = async () => {
    if (!id) return;
    const file = uploadFiles[0];
    if (!file) {
      toast.error("Выберите файл");
      return;
    }
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("docType", uploadDocType);
      form.append("entityType", "production_order");
      form.append("entityId", id);
      if (uploadTitle.trim()) form.append("title", uploadTitle.trim());
      if (uploadIssuedAt) form.append("issuedAt", uploadIssuedAt.toISOString().slice(0, 10));
      await apiUpload<DocumentResponseDto>("/documents", form);
      setUploadFiles([]);
      setUploadTitle("");
      setUploadIssuedAt(undefined);
      load();
      toast.success("Документ загружен", { description: documentTypeLabel(uploadDocType) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить документ");
    } finally {
      setIsUploading(false);
    }
  };

  const openDocument = async (docId: string, title: string) => {
    setDownloadingId(docId);
    try {
      const blob = await apiDownload(`/documents/${docId}/file`);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : `Не удалось открыть «${title}»`);
    } finally {
      setDownloadingId(null);
    }
  };

  if (error) return <ErrorState title="Не удалось загрузить партию" onRetry={load} />;
  if (!passport) return <SkeletonList />;

  const snapshot = passport.costSnapshot;
  const plannedQuantity = Math.round(Number(passport.plannedQuantity));

  // apiRequest не восстанавливает Date из JSON (createdAt приходит строкой,
  // хотя тип DocumentResponseDto утверждает Date) — сравнение через new
  // Date(...) обязательно, .valueOf() на сырой строке даёт NaN и ломает
  // сортировку молча.
  //
  // Актуальная версия определяется флагом isCurrentVersion, который ставит
  // сервер при формировании новой редакции, а не «самой свежей датой».
  // Прежний комментарий здесь утверждал, что повторное формирование создаёт
  // независимый документ — это неверно: Document Engine связывает редакции
  // через supersedesDocumentId и гасит флаг у предыдущей (проверено).
  const sortedDocuments = [...passport.documents].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const currentDoc = sortedDocuments.find((doc) => doc.isCurrentVersion) ?? sortedDocuments[0];
  const previousDocs = sortedDocuments.filter((doc) => doc.id !== currentDoc?.id);

  // Спецификация выпускается по подтверждённому заказу — у черновика ещё нет
  // ни зафиксированных данных партии, ни основания для номера документа.
  const canGenerate = passport.status !== "draft" && passport.status !== "cancelled";

  // Матрица размер×цвет — союз всех размеров/цветов в порядке первого
  // появления (не предполагаем, что у каждого цвета один и тот же набор
  // размеров — реальные данные могут быть неравномерными).
  const colors: string[] = [];
  const sizes: string[] = [];
  for (const variant of passport.variants) {
    if (!colors.includes(variant.color)) colors.push(variant.color);
    if (!sizes.includes(variant.size)) sizes.push(variant.size);
  }
  const quantityFor = (color: string, size: string): number | null => {
    const variant = passport.variants.find((row) => row.color === color && row.size === size);
    return variant ? Math.round(Number(variant.quantity)) : null;
  };

  // Сумма партии — по согласованной с цехом цене за единицу: ровно то число,
  // которое печатается в спецификации и по которому цех выставляет счёт.
  // Раньше здесь была specificationPricePerUnit (цена за вычетом 175);
  // владелец проекта не подтвердил смысл этого вычета, поэтому построенные на
  // нём показатели из интерфейса убраны, а не показаны «примерно верными».
  const agreedUnitPrice = Number(passport.agreedUnitPrice);
  const batchSum = agreedUnitPrice * plannedQuantity;

  // Состояние шага «Раскрой» на шкале выводится из раскройных заданий, а не из
  // статуса заказа: статус описывает отношения с цехом, раскрой — нашу работу.
  const cuttingStage: CuttingStageState =
    cuttingOrders.length === 0
      ? "none"
      : cuttingOrders.some((order) => order.status === "draft" || order.status === "issued")
        ? "in_progress"
        : "done";

  // Потребность в материалах по этой партии — из норм, замороженных при
  // подтверждении заказа. Стоимости разных валютных контуров (ткань в USD,
  // фурнитура в сомах) не складываются в одно число: итог считается отдельно
  // по каждой валюте (docs/PRINCIPLES.md, принцип 21).
  const requirement = passport.materialRequirement;
  const requirementTotals = new Map<string, number>();
  for (const row of requirement) {
    if (row.totalCost === null || row.currency === null) continue;
    requirementTotals.set(row.currency, (requirementTotals.get(row.currency) ?? 0) + row.totalCost);
  }
  const requirementWithoutPrice = requirement.filter((row) => row.totalCost === null);

  // Строки себестоимости — те же пять статей, что показывались и раньше;
  // доля считается от их суммы, а не вводится как новая величина.
  const rawCost = snapshot
    ? [
        { label: "Ткань", unitCost: snapshot.fabricCostPerUnit },
        { label: "Пошив", unitCost: snapshot.sewingCostPerUnit },
        { label: "Фурнитура", unitCost: snapshot.trimCostPerUnit },
        { label: "Упаковка", unitCost: snapshot.packagingCostPerUnit },
        { label: "Прочее", unitCost: snapshot.otherCostPerUnit },
      ].filter((row) => row.unitCost > 0)
    : [];
  const costUnitTotal = rawCost.reduce((sum, row) => sum + row.unitCost, 0);
  const costRows: CostRow[] = rawCost.map((row) => ({
    label: row.label,
    unitCost: row.unitCost,
    total: row.unitCost * plannedQuantity,
    share: costUnitTotal > 0 ? Math.round((row.unitCost / costUnitTotal) * 100) : 0,
  }));

  // Форма загрузки показывается и при пустом списке документов, и под
  // существующим: документ приходит от контрагента в любой момент жизни
  // партии, а не только «после спецификации».
  const uploadForm = (
    <div className="mt-4 rounded-[10px] border border-border bg-secondary/50 p-3.5">
      <SectionLabel>Загрузить документ</SectionLabel>
      <p className="t-meta mt-1.5 mb-3">
        Подписанная спецификация, счёт, накладная. Файл сохраняется в партии и не меняет её данные.
      </p>
      <div className="flex flex-col gap-3">
        <Upload
          files={uploadFiles}
          onChange={setUploadFiles}
          accept="application/pdf,image/jpeg,image/png"
          multiple={false}
          label="Перетащите файл сюда или нажмите"
          hint="PDF, JPG или PNG до 20 МБ"
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Тип документа">
            <Select value={uploadDocType} onValueChange={setUploadDocType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UPLOADABLE_DOC_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {documentTypeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Название" hint={<span className="t-meta">необязательно</span>}>
            <Input
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              placeholder="Имя файла, если не указано"
            />
          </Field>
          <Field label="Дата документа" hint={<span className="t-meta">необязательно</span>}>
            <DatePicker value={uploadIssuedAt} onChange={setUploadIssuedAt} />
          </Field>
        </div>
        <Button
          size="sm"
          className="md:self-start"
          loading={isUploading}
          disabled={uploadFiles.length === 0}
          onClick={() => void uploadDocument()}
        >
          Загрузить документ
        </Button>
      </div>
    </div>
  );

  const renderTab = (key: TabKey) => {
    if (key === "cost") {
      if (!snapshot) {
        return (
          <EmptyState
            compact
            title={
              passport.status === "draft"
                ? "Себестоимость появится после подтверждения"
                : "Снимок стоимости недоступен"
            }
            description={
              passport.status === "draft"
                ? "При подтверждении заказа GarmentOS зафиксирует себестоимость по текущим закупочным ценам — этот снимок больше не изменится, даже если цены вырастут."
                : "Этот заказ подтверждён до того, как система начала фиксировать данные партии — себестоимость для него не сохранена."
            }
          />
        );
      }
      return (
        <div>
          <div className="num mb-3 text-[11px] text-muted-foreground">
            Данные партии зафиксированы {formatDate(snapshot.capturedAt)} · больше не пересчитываются
          </div>
          {costRows.length > 0 ? (
            <CostBreakdown
              rows={costRows}
              total={{
                label: "Себестоимость факт",
                unitCost: snapshot.actualCostPerUnit,
                total: snapshot.actualCostPerUnit * plannedQuantity,
              }}
            />
          ) : null}

          {snapshot.materialsWithoutPriceHistory.length > 0 && (
            <p className="mt-4 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] font-medium text-warning">
              Без истории закупочной цены на момент снимка:{" "}
              {snapshot.materialsWithoutPriceHistory.join(", ")} — не учтены в себестоимости.
            </p>
          )}

          <div className="mt-4">
            <SectionLabel>Счета по этой партии</SectionLabel>
            {passport.invoices.length === 0 ? (
              <p className="t-meta mt-2">Пока не выставлены.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-[10px] border border-border px-3">
                {passport.invoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="num text-[13px] font-medium">{formatMoney(invoice.amount, "сом", 2)}</span>
                    <span className="flex items-center gap-2">
                      {invoice.dueDate ? (
                        <span className="num text-[11px] text-muted-foreground">до {formatDate(invoice.dueDate)}</span>
                      ) : null}
                      <StatusBadge status={invoice.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      );
    }

    if (key === "materials") {
      if (requirement.length === 0) {
        return (
          <EmptyState
            compact
            title={
              passport.status === "draft"
                ? "Нормы зафиксируются при подтверждении"
                : "Нормы расхода для этой партии не зафиксированы"
            }
            description={
              passport.status === "draft"
                ? "При подтверждении заказа GarmentOS запомнит нормы расхода из карточки модели. Дальше их можно менять в карточке — на этой партии это уже не отразится."
                : "Заказ подтверждён до того, как система начала запоминать нормы расхода. Подставить сегодняшние нормы нельзя: они могли измениться, и партия перестала бы совпадать с тем, по чему её шили."
            }
          />
        );
      }
      return (
        <div>
          <div className="num mb-3 text-[11px] text-muted-foreground">
            {snapshot ? `Зафиксированы ${formatDate(snapshot.capturedAt)}` : "Зафиксированы при подтверждении"}
            {snapshot?.materialNormsVersion ? ` · нормы модели, редакция №${snapshot.materialNormsVersion}` : ""} · на{" "}
            {formatQuantity(plannedQuantity, "изделий")}
          </div>

          <div className="divide-y divide-border rounded-[10px] border border-border">
            {requirement.map((row) => (
              <div key={row.materialId} className="px-3.5 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] font-medium">{row.materialName}</span>
                  <span className="t-meta shrink-0">{materialTypeLabel(row.materialType)}</span>
                </div>
                <div className="num mt-1.5 text-[11px] text-muted-foreground">
                  норма {formatQuantity(row.quantityPerUnit, unitLabel(row.unit), 3)} на изделие
                  {row.wastePercent > 0
                    ? ` + ${formatQuantity(row.wastePercent, "% отходов", 2)} = ${formatQuantity(row.consumptionPerUnit, unitLabel(row.unit), 3)}`
                    : ""}
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <span>
                    <span className="eyebrow text-[10px]">Требуется на партию</span>
                    <span className="num ml-2 text-[15px] font-semibold">
                      {formatQuantity(row.totalRequired, unitLabel(row.unit), 2)}
                    </span>
                  </span>
                  {row.unitPrice !== null && row.currency !== null ? (
                    <span className="num text-[12px] text-muted-foreground">
                      {formatMoney(row.unitPrice, row.currency, 2)} за {unitLabel(row.unit)} ·{" "}
                      <span className="font-medium text-foreground">
                        {formatMoney(row.totalCost ?? 0, row.currency, 2)}
                      </span>
                    </span>
                  ) : (
                    <span className="t-meta">закупочной цены нет — стоимость не считается</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {requirementTotals.size > 0 ? (
            <div className="mt-4">
              <SectionLabel>Стоимость материалов на партию</SectionLabel>
              {/* Валюты показываются отдельными строками и намеренно не
                  суммируются: курс на дату закупки система не хранит, а
                  сложение USD и сомов дало бы число, которым нельзя
                  пользоваться (docs/PRINCIPLES.md, принцип 21). */}
              <ul className="mt-2 divide-y divide-border rounded-[10px] border border-border px-3">
                {[...requirementTotals.entries()].map(([currency, total]) => (
                  <li key={currency} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="t-secondary">Итого в валюте {currency}</span>
                    <span className="num text-[13px] font-medium">{formatMoney(total, currency, 2)}</span>
                  </li>
                ))}
              </ul>
              {requirementTotals.size > 1 ? (
                <p className="t-meta mt-2">
                  Суммы в разных валютах не складываются: курс на дату закупки система не хранит.
                </p>
              ) : null}
            </div>
          ) : null}

          {requirementWithoutPrice.length > 0 ? (
            <p className="mt-4 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] font-medium text-warning">
              Без закупочной цены на момент подтверждения:{" "}
              {requirementWithoutPrice.map((row) => row.materialName).join(", ")} — потребность посчитана, стоимость нет.
            </p>
          ) : null}
        </div>
      );
    }

    if (key === "cutting") {
      const active = cuttingOrders[cuttingOrders.length - 1];
      const canCreate = passport.status !== "draft" && passport.status !== "cancelled";
      if (cuttingOrders.length === 0) {
        return (
          <EmptyState
            compact
            title="Раскройного задания ещё нет"
            description={
              canCreate
                ? "Задание соберётся само: размеры и цвета возьмутся из заказа, потребность в материалах — из зафиксированных норм партии."
                : "Раскрой начинается по подтверждённому заказу. Сначала подтвердите заказ."
            }
            action={
              canCreate ? (
                <Button size="sm" loading={cuttingBusy} onClick={() => void createCuttingOrder()}>
                  Создать раскройное задание
                </Button>
              ) : undefined
            }
          />
        );
      }
      if (!active) return null;

      const sizes = [...new Set(active.results.map((row) => row.size))];
      const colors = [...new Set(active.results.map((row) => row.color))];
      const cell = (size: string, color: string) =>
        active.results.find((row) => row.size === size && row.color === color);
      const isDraft = active.status === "draft";
      const isIssued = active.status === "issued";
      const isCompleted = active.status === "completed";

      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium">
              Задание №{active.number} · {CUTTING_STATUS_LABELS[active.status]}
              {active.executorType === "workshop" && active.executorWorkshopName
                ? ` · подрядчик «${active.executorWorkshopName}»`
                : " · кроим сами"}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" loading={cuttingBusy} onClick={() => void generateCuttingDocument(active.id)}>
                Сформировать задание
              </Button>
              {cuttingOrders.length > 0 && isCompleted && (
                <Button variant="secondary" size="sm" loading={cuttingBusy} onClick={() => void createCuttingOrder()}>
                  Добавить докрой
                </Button>
              )}
            </span>
          </div>

          {/* Матрица кроя: план и факт по каждому размеру и цвету. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="border border-border px-2 py-1.5 text-left font-medium">Размер</th>
                  {colors.map((color) => (
                    <th key={color} className="border border-border px-2 py-1.5 text-right font-medium">
                      {color}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sizes.map((size) => (
                  <tr key={size}>
                    <td className="border border-border px-2 py-1 font-medium">{size}</td>
                    {colors.map((color) => {
                      const row = cell(size, color);
                      if (!row) return <td key={color} className="border border-border px-2 py-1 text-right text-muted-foreground">—</td>;
                      return (
                        <td key={color} className="border border-border px-2 py-1 text-right">
                          {isIssued ? (
                            <NumberInput
                              value={actuals[row.productVariantId] ?? row.actualQuantity ?? row.plannedQuantity}
                              onChange={(value) =>
                                setActuals((prev) => ({ ...prev, [row.productVariantId]: value }))
                              }
                              min={0}
                            />
                          ) : (
                            <span className="num">
                              {formatQuantity(row.plannedQuantity)}
                              {row.actualQuantity !== null && row.actualQuantity !== row.plannedQuantity ? (
                                <span className="ml-1 text-warning">→ {formatQuantity(row.actualQuantity)}</span>
                              ) : null}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="border border-border px-2 py-1.5 font-semibold">Итого</td>
                  {colors.map((color) => (
                    <td key={color} className="num border border-border px-2 py-1.5 text-right font-semibold">
                      {formatQuantity(
                        sizes.reduce((sum, size) => sum + (cell(size, color)?.plannedQuantity ?? 0), 0),
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <SectionLabel>Материалы</SectionLabel>
            <div className="mt-2 divide-y divide-border rounded-[10px] border border-border">
              {active.materials.map((material) => (
                <div key={material.materialId} className="px-3.5 py-3">
                  <div className="text-[13px] font-medium">{material.materialName}</div>
                  <div className="mt-2 flex flex-wrap items-end gap-3">
                    <span className="num text-[12px] text-muted-foreground">
                      Требуется {formatQuantity(material.requiredQuantity, unitLabel(material.unit), 2)}
                    </span>
                    {isDraft ? (
                      <Field label="Выделено" className="min-w-[120px]">
                        <NumberInput
                          value={allocations[material.materialId] ?? material.requiredQuantity}
                          onChange={(value) => setAllocations((prev) => ({ ...prev, [material.materialId]: value }))}
                          min={0}
                          decimals={2}
                        />
                      </Field>
                    ) : (
                      <span className="num text-[12px] text-muted-foreground">
                        Выделено{" "}
                        {material.allocatedQuantity === null
                          ? "—"
                          : formatQuantity(material.allocatedQuantity, unitLabel(material.unit), 2)}
                      </span>
                    )}
                    {isIssued || isCompleted ? (
                      <Field label="Использовано" className="min-w-[130px]">
                        <NumberInput
                          value={consumed[material.materialId] ?? material.consumedQuantity ?? undefined}
                          onChange={(value) => setConsumed((prev) => ({ ...prev, [material.materialId]: value }))}
                          min={0}
                          decimals={2}
                        />
                      </Field>
                    ) : null}
                    {material.consumedQuantity !== null && material.allocatedQuantity !== null ? (
                      <span className="num text-[12px] text-muted-foreground">
                        Остаток{" "}
                        {formatQuantity(material.allocatedQuantity - material.consumedQuantity, unitLabel(material.unit), 2)}
                      </span>
                    ) : null}
                    <Field label="Рулоны" className="min-w-[150px] flex-1">
                      <Input
                        value={rollNotes[material.materialId] ?? material.rollNote ?? ""}
                        onChange={(event) =>
                          setRollNotes((prev) => ({ ...prev, [material.materialId]: event.target.value }))
                        }
                        placeholder="например: 700 + 600"
                      />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {shortages.length > 0 && (
            <p className="rounded-[10px] border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] font-medium text-warning">
              Расхождение со складом:{" "}
              {shortages
                .map((row) => `${row.materialName} — не хватало ${formatQuantity(row.shortage, "", 2)}`)
                .join("; ")}
              . Факт кроя сохранён; оприходуйте недостающий приход.
            </p>
          )}

          <div className="flex flex-wrap items-end gap-3">
            {(isIssued || isCompleted) && (
              <Field label="Склад, с которого брали материал" className="min-w-[220px]">
                <Select value={factWarehouse} onValueChange={setFactWarehouse}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите склад" />
                  </SelectTrigger>
                  <SelectContent>
                    {warehouses.map((warehouse) => (
                      <SelectItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {isDraft && (
              <Button size="sm" loading={cuttingBusy} onClick={() => void issueCutting(active.id, active.materials)}>
                Выдать в крой
              </Button>
            )}
            {isIssued && (
              <Button size="sm" loading={cuttingBusy} onClick={() => void submitFact(active, false)}>
                Внести факт кроя
              </Button>
            )}
            {isCompleted && (
              <Button variant="secondary" size="sm" loading={cuttingBusy} onClick={() => void submitFact(active, true)}>
                Исправить факт
              </Button>
            )}
          </div>
          <p className="t-meta">
            {isDraft
              ? "Выдача в крой фиксирует план и выделенное количество. Материал со склада не списывается."
              : isIssued
                ? "Фактический расход спишется со склада. Если остатка не хватит, факт всё равно сохранится, а расхождение будет показано."
                : "Исправление проводится отдельной корректировкой склада на разницу; прежняя запись сохраняется в истории."}
          </p>
        </div>
      );
    }

    if (key === "docs") {
      if (passport.documents.length === 0) {
        return (
          <div>
            <EmptyState
              compact
              title="Документов пока нет"
              description={
                canGenerate
                  ? "Сформируйте спецификацию или загрузите документ, полученный от цеха."
                  : "Спецификация формируется по подтверждённому заказу. Сначала подтвердите заказ в списке заказов пошива."
              }
              action={
                canGenerate ? (
                  <Button size="sm" loading={isGenerating} onClick={() => void generateSpecification()}>
                    Сформировать спецификацию
                  </Button>
                ) : undefined
              }
            />
            {uploadForm}
          </div>
        );
      }
      return (
        <div className="divide-y divide-border">
          {currentDoc ? (
            <DocumentRow
              title={`${documentTypeLabel(currentDoc.docType)} · ${currentDoc.title ?? ""}`.replace(/ · $/, "")}
              version="Актуальная"
              format="PDF"
              date={currentDoc.createdAt}
              onOpen={() => void openDocument(currentDoc.id, currentDoc.title ?? "Спецификация")}
            />
          ) : null}
          {previousDocs.map((doc) => (
            <DocumentRow
              key={doc.id}
              title={`${documentTypeLabel(doc.docType)} · ${doc.title ?? ""}`.replace(/ · $/, "")}
              version="Предыдущая редакция"
              format="PDF"
              date={doc.createdAt}
              onOpen={() => void openDocument(doc.id, doc.title ?? "Спецификация")}
            />
          ))}
          {canGenerate ? (
            <div className="pt-3">
              <Button variant="secondary" size="sm" onClick={() => setConfirmRegenerate(true)}>
                Сформировать заново
              </Button>
            </div>
          ) : null}
          {uploadForm}
        </div>
      );
    }

    if (key === "colors") {
      if (colors.length === 0 || sizes.length === 0) {
        return (
          <EmptyState compact title="Размеры не заданы" description="В заказе нет ни одного варианта модели с размером и цветом." />
        );
      }
      return (
        <div className="space-y-4">
          {colors.map((color) => (
            <div key={color}>
              <SectionLabel>{color}</SectionLabel>
              {/* Три колонки — как в прототипе; при большем числе размеров
                  ячейки переносятся на следующую строку. */}
              <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-[10px] border border-border bg-border">
                {sizes.map((size) => (
                  <div key={size} className="bg-card px-3 py-2.5 text-center">
                    <div className="num text-[11px] text-muted-foreground">{size}</div>
                    <div className="num mt-1 text-[16px] font-semibold">{quantityFor(color, size) ?? "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (key === "contract") {
      // Все поля — из снимка партии (productionOrderCostSnapshotSchema);
      // до этого экрана они доезжали, но не показывались.
      if (!snapshot) {
        return (
          <EmptyState
            compact
            title="Условия договора не зафиксированы"
            description="Реквизиты договора сохраняются в снимке партии при подтверждении заказа."
          />
        );
      }
      return (
        <dl className="grid grid-cols-1 gap-y-2.5 text-[13px] sm:grid-cols-[180px_1fr]">
          <dt className="text-muted-foreground">Договор</dt>
          <dd className="num">
            {snapshot.contractNumber} от {formatDate(snapshot.contractDate)}
          </dd>
          <dt className="text-muted-foreground">Заказчик</dt>
          <dd>{snapshot.customerName}</dd>
          <dt className="text-muted-foreground">Исполнитель</dt>
          <dd>{snapshot.contractorName}</dd>
          <dt className="text-muted-foreground">Доставка</dt>
          <dd>{snapshot.deliveryMethod}</dd>
          <dt className="text-muted-foreground">Условия оплаты</dt>
          <dd>{snapshot.paymentTerms}</dd>
        </dl>
      );
    }

    return passport.timeline.length > 0 ? (
      <Timeline
        items={passport.timeline.map((event) => ({
          title: event.label,
          date: event.occurredAt,
        }))}
      />
    ) : (
      <EmptyState compact title="Событий пока нет" description="История заказа наполняется по мере его прохождения." />
    );
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Заказы пошива", onClick: () => void navigate("/production-orders") },
              { label: passport.product.name },
            ]}
          />
        }
        title={passport.product.name}
        subtitle={
          <span className="num">
            {passport.workshop.name} · {formatQuantity(plannedQuantity, "изделий")} · срок{" "}
            {formatDate(passport.dueDate)}
          </span>
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void navigate("/production-orders")}>
              К списку
            </Button>
            {/* Спецификация выпускается по подтверждённому заказу: реквизиты
                договора и себестоимость фиксируются в момент подтверждения,
                у черновика их ещё нет. Поэтому у черновика вместо кнопки —
                подсказка, что нужно сделать раньше. */}
            {canGenerate && !currentDoc ? (
              <Button size="sm" loading={isGenerating} onClick={() => void generateSpecification()}>
                Сформировать спецификацию
              </Button>
            ) : null}
            {/* В шапке — не больше двух действий: на 390px третья кнопка
                выталкивала страницу за пределы экрана (поймано проверкой
                адаптива). Повторное формирование живёт во вкладке
                «Документы», рядом с самими документами. */}
            {currentDoc ? (
              <Button
                size="sm"
                loading={downloadingId === currentDoc.id}
                onClick={() => void openDocument(currentDoc.id, currentDoc.title ?? "Спецификация")}
              >
                Скачать спецификацию
              </Button>
            ) : null}
          </>
        }
      />

      {/* Повторное формирование расходует номер спецификации по договору
          цеха и делает прежнюю редакцию неактуальной — поэтому оно требует
          явного подтверждения, а не одного нажатия. */}
      <Dialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сформировать спецификацию заново?</DialogTitle>
            <DialogDescription>
              Будет создана новая редакция со следующим номером по договору цеха.
              {currentDoc?.title ? ` Текущая — «${currentDoc.title}» — ` : " Текущая редакция "}
              станет неактуальной, но останется в документах партии.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setConfirmRegenerate(false)}>
              Отмена
            </Button>
            <Button size="sm" loading={isGenerating} onClick={() => void generateSpecification()}>
              Сформировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. Идентичность */}
      <section className="elev-2 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[10px] bg-sidebar bg-[linear-gradient(180deg,color-mix(in_oklab,var(--sidebar-primary)_9%,transparent)_0%,transparent_60%)] px-4 py-4 text-sidebar-foreground md:px-5">
        <div className="flex items-center gap-3">
          <div>
            <div className="editorial text-[17px] leading-tight">{passport.product.name}</div>
            <div className="text-[12px] text-sidebar-foreground/60">{passport.workshop.name}</div>
          </div>
        </div>
        <div className="h-8 w-px bg-sidebar-border max-md:hidden" />
        <div>
          <div className="eyebrow text-sidebar-foreground/50">Количество</div>
          <div className="num mt-1 text-[14px] font-medium">{formatQuantity(plannedQuantity, "изделий")}</div>
        </div>
        <div className="ml-auto inline-flex items-center gap-2 rounded-[4px] border border-sidebar-border bg-sidebar-accent px-2.5 py-1.5 text-[12px] font-medium">
          <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
          {statusMeta(passport.status).label}
        </div>
      </section>

      {/* 2. Деньги + 4. Требует внимания */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="px-4 pt-4 md:px-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[16px]">Деньги</CardTitle>
              <span className="t-meta shrink-0">по партии</span>
            </div>
          </div>
          {snapshot ? (
            <div className="mt-2 grid grid-cols-1 gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
              <div className="bg-card">
                <MoneyBlock
                  label="Сумма партии"
                  value={batchSum}
                  currency="руб"
                  decimals={2}
                  sub={`по спецификации, ${formatQuantity(plannedQuantity, "изделий")}`}
                />
              </div>
              <div className="bg-card">
                <MoneyBlock
                  label="Цена за изделие"
                  value={agreedUnitPrice}
                  currency="руб"
                  decimals={2}
                  sub="согласована с цехом"
                />
              </div>
              <div className="bg-card">
                <MoneyBlock
                  label="Себестоимость факт"
                  value={snapshot.actualCostPerUnit}
                  decimals={2}
                  sub="за изделие, на момент подтверждения"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-5">
              <EmptyState
                compact
                title={
                  passport.status === "draft"
                    ? "Себестоимость появится после подтверждения"
                    : "Снимок стоимости недоступен"
                }
                description={
                  passport.status === "draft"
                    ? "При подтверждении заказа GarmentOS зафиксирует себестоимость по текущим закупочным ценам."
                    : "Этот заказ подтверждён до того, как система начала фиксировать данные партии."
                }
              />
            </div>
          )}
        </Card>

        {/* Слот «Требует внимания» из прототипа. В apps/web единственный
            реальный повод для тревоги на этом экране — просрочка срока
            сдачи; сумма неоплаченного счёта здесь не считается, чтобы не
            вводить метрику, которой в системе нет. */}
        {passport.daysOverdue !== null ? (
          <Card className="border-warning/30 bg-warning/[0.03] p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[16px]">Требует внимания</CardTitle>
              <span className="t-meta shrink-0">1 позиция</span>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-warning/[0.1] text-warning">
                <IconAlert size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium">Просрочен срок сдачи цехом</div>
                <div className="num mt-1 text-[20px] font-semibold text-warning">
                  {passport.daysOverdue} дн.
                </div>
                <div className="num mt-1 text-[11px] text-muted-foreground">
                  срок был {formatDate(passport.dueDate)}
                </div>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 md:p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-[16px]">Требует внимания</CardTitle>
            </div>
            <p className="t-secondary mt-3">Срок сдачи не нарушен.</p>
          </Card>
        )}
      </div>

      {/* 3. Производство */}
      <Card className="mt-4 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-[16px]">Производство</CardTitle>
          <span className="t-meta shrink-0">6 этапов</span>
        </div>
        <div className="mt-4">
          {isProductionStage(passport.status) ? (
            <ProductionStepper current={passport.status} cutting={cuttingStage} />
          ) : (
            <p className="t-secondary">Заказ отменён — партия вышла из производственной шкалы.</p>
          )}
        </div>
        {/* P0-1: переход на следующий этап без Telegram — цех сегодня
            сообщает об этом текстом, но канал не настроен ни для одного
            цеха на пилоте. */}
        {passport.status === "placed" || passport.status === "in_progress" ? (
          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            <span className="t-secondary">Цех сообщил:</span>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={isChangingStatus}
              onClick={() =>
                void changeOrderStatus(passport.status === "placed" ? "in_progress" : "ready_for_pickup")
              }
            >
              {passport.status === "placed" ? "Начали шить" : "Готово к отгрузке"}
            </Button>
          </div>
        ) : null}
        <div className="mt-4">
          <EmptyState
            compact
            title="Детальный ход пошива появится здесь"
            description="Проценты готовности, комментарии и фото от цеха — разделы 19-20 «Баланса производственной партии», ждёт реализации. Раскрой уже ведётся во вкладке «Раскрой»."
          />
        </div>
      </Card>

      {/* 5. Детали — табы на десктопе */}
      <div className="mt-4 hidden md:block">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-border px-3 pt-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "interactive relative -mb-px h-9 rounded-t-[6px] px-3 text-[13px]",
                  tab === t.key
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-primary transition-[opacity,transform] duration-200",
                    tab === t.key ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                  )}
                />
              </button>
            ))}
          </div>
          <div key={tab} className="anim-content p-5">
            {renderTab(tab)}
          </div>
        </Card>
      </div>

      {/* 5. Детали — аккордеоны на мобильном */}
      <div className="mt-4 space-y-2 md:hidden">
        {TABS.map((t, i) => (
          <Accordion key={t.key} title={t.label} defaultOpen={i === 0}>
            {renderTab(t.key)}
          </Accordion>
        ))}
      </div>

      {/* Разделы без источника данных. В прототипе им соответствия нет —
          показываем честные пустые состояния, а не выдуманные нули. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[
          {
            title: "ОТК и брак",
            hint: "Отправлено / принято / брак / устранение — появится после утверждения раздела 4 «Баланса производственной партии».",
          },
          {
            title: "Логистика",
            hint: "Трек Red Express — раздел 22 архитектуры партии, интеграция с перевозчиком.",
          },
        ].map((section) => (
          <Card key={section.title} className="p-4 md:p-5">
            <CardTitle className="text-[16px]">{section.title}</CardTitle>
            <div className="mt-3">
              <EmptyState compact title="Раздел ещё не подключён" description={section.hint} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
