import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type DocumentResponseDto,
  type PresetResponseDto,
  type ProductResponseDto,
  type ProductVariantResponseDto,
  type ProductionOrderResponseDto,
  type PreviewProductionOrderVariantsResponseDto,
  type ProductionOrderVariantDraft,
  type SizeDistributionMode,
  type SpecificationResponseDto,
  type WarehouseResponseDto,
  type WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { Button } from "../design-system/Button/Button";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SearchBar } from "../design-system/Search/SearchBar";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { Accordion, BatchCard, usePhotoUrl } from "../design-system/Blocks";
import { formatQuantity } from "../lib/format";
import { buildBatchCardFromOrder } from "../lib/batch-card";
import { NEXT_STATUS, ORDER_STATUS_LABELS, type ManualOrderStatus } from "../lib/production-order-status-labels";
import { Combobox } from "../design-system/Select/Combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { NumberInput } from "../design-system/Input/NumberInput";
import { DatePicker } from "../design-system/Form/DatePicker";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../design-system/Modal/Dialog";
import { cn } from "../design-system/utils";

// Форма-эталон (docs/UI_FOUNDATION.md, шаг 5) — первый экран, полностью
// собранный из GarmentInput/GarmentSelect/GarmentDatePicker/GarmentButton/
// GarmentCard вместо голого HTML. После утверждения владельцем — образец
// для переноса остальных 7 форм (не переносятся в этом же цикле работ).
const STATUS_FILTERS: FilterOption<
  | "all"
  | "draft"
  | "placed"
  | "in_progress"
  | "sewing_completed"
  | "ready_for_pickup"
  | "shipped_to_fulfillment"
  | "received"
  | "completed"
>[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновик" },
  { value: "placed", label: "Размещён" },
  { value: "in_progress", label: "В работе" },
  { value: "sewing_completed", label: "Пошив завершён" },
  { value: "ready_for_pickup", label: "Готово" },
  { value: "shipped_to_fulfillment", label: "На фулфилменте" },
  { value: "received", label: "Принято" },
  { value: "completed", label: "Завершена" },
];

export function ProductionOrdersPage() {
  const navigate = useNavigate();
  const { items: orders, isLoading, reload } = useCrudResource<ProductionOrderResponseDto, never>("/production-orders");
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponseDto[]>([]);
  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);

  const [productId, setProductId] = useState("");
  const [workshopId, setWorkshopId] = useState("");
  const [unitPrice, setUnitPrice] = useState<number | undefined>(undefined);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [lines, setLines] = useState<ProductionOrderVariantDraft[]>([]);
  // Матрица размер × цвет: выбираем цвета с количеством, система раскладывает
  // по размерам, пользователь при необходимости правит отдельные ячейки —
  // и только потом сохраняет (владелец проекта, 2026-08-30).
  const [colorRows, setColorRows] = useState<Array<{ color: string; quantity: number | undefined }>>([]);
  // Режим распределения размеров (ПРОМПТ №3, раздел 3) — "Равномерно" делит
  // количество поровну между размерами, "Стандарт производства" — по весам
  // размерного ряда карточки модели (уже существующий distributeQuantityByRatio).
  const [distributionMode, setDistributionMode] = useState<SizeDistributionMode>("ratio");
  const [matrix, setMatrix] = useState<PreviewProductionOrderVariantsResponseDto | null>(null);
  const [matrixQuantities, setMatrixQuantities] = useState<Record<string, number>>({});
  const [isPreviewing, setIsPreviewing] = useState(false);

  // Пресеты стоимости пошива (ПРОМПТ №3, раздел 5) — сохранённые значения
  // вместо повторного ручного ввода каждый раз; новое значение сохраняется
  // для будущего выбора через POST /presets.
  const [sewingCostPresets, setSewingCostPresets] = useState<PresetResponseDto[]>([]);
  const [customSewingCost, setCustomSewingCost] = useState<number | undefined>(undefined);
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  const [pendingVariantId, setPendingVariantId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState<number | undefined>(undefined);
  // Диалог фактической приёмки (P0-1) — открыт для receivingOrder, пока не null.
  const [receivingOrder, setReceivingOrder] = useState<ProductionOrderResponseDto | null>(null);
  const [receivingWarehouseId, setReceivingWarehouseId] = useState("");
  const [receivingVariants, setReceivingVariants] = useState<ProductVariantResponseDto[]>([]);
  const [receivingQuantities, setReceivingQuantities] = useState<Record<string, number>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOrderAction, setPendingOrderAction] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);

  // Данные для BatchCard (Model-first Minimal Core, ПРОМПТ №06.1): номер
  // спецификации, фото модели, размер/цвет вариантов — по уникальным
  // productId/specificationId, встретившимся в списке заказов, а не по
  // одному запросу на строку (без N+1).
  const [specifications, setSpecifications] = useState<SpecificationResponseDto[]>([]);
  const [photoByProduct, setPhotoByProduct] = useState<Record<string, string | null>>({});
  const [variantsByProduct, setVariantsByProduct] = useState<Record<string, ProductVariantResponseDto[]>>({});

  const loadReferences = () => {
    setReferenceError(false);
    Promise.all([
      apiRequest<ProductResponseDto[]>("/products").then(setProducts),
      apiRequest<WorkshopResponseDto[]>("/workshops").then(setWorkshops),
      apiRequest<WarehouseResponseDto[]>("/warehouses").then(setWarehouses),
      apiRequest<SpecificationResponseDto[]>("/specifications").then(setSpecifications),
    ]).catch(() => setReferenceError(true));
  };

  useEffect(() => {
    loadReferences();
  }, []);

  useEffect(() => {
    const missingProductIds = [...new Set(orders.map((order) => order.productId))].filter(
      (productId) => !(productId in variantsByProduct),
    );
    if (missingProductIds.length === 0) return;
    for (const productId of missingProductIds) {
      void apiRequest<DocumentResponseDto[]>(`/documents?entityType=product&entityId=${productId}`)
        .then((docs) => {
          const photo = docs.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion) ?? null;
          setPhotoByProduct((prev) => ({ ...prev, [productId]: photo?.id ?? null }));
        })
        .catch(() => setPhotoByProduct((prev) => ({ ...prev, [productId]: null })));
      void apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`)
        .then((rows) => setVariantsByProduct((prev) => ({ ...prev, [productId]: rows })))
        .catch(() => setVariantsByProduct((prev) => ({ ...prev, [productId]: [] })));
    }
  }, [orders]);

  useEffect(() => {
    if (!productId) {
      setVariants([]);
      return;
    }
    void apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`).then(setVariants);
    // Фото модели для визарда (ПРОМПТ №3, раздел 1: "Модель → фото/название")
    // — переиспользует ту же карту photoByProduct, что и карточки заказов
    // ниже, не заводит отдельный запрос ради того же документа.
    if (!(productId in photoByProduct)) {
      void apiRequest<DocumentResponseDto[]>(`/documents?entityType=product&entityId=${productId}`)
        .then((docs) => {
          const photo = docs.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion) ?? null;
          setPhotoByProduct((prev) => ({ ...prev, [productId]: photo?.id ?? null }));
        })
        .catch(() => setPhotoByProduct((prev) => ({ ...prev, [productId]: null })));
    }
  }, [productId]);

  // Пресеты стоимости пошива (ПРОМПТ №3, раздел 5) — загружаются один раз,
  // сервер сам досеивает значения по умолчанию (350/380/450 сом) для новых
  // компаний при первом обращении.
  useEffect(() => {
    apiRequest<PresetResponseDto[]>("/presets?kind=sewing_cost")
      .then(setSewingCostPresets)
      .catch(() => setSewingCostPresets([]));
  }, []);

  const selectedProductPhotoUrl = usePhotoUrl(photoByProduct[productId] ?? null);

  const addSewingCostPreset = async () => {
    if (!customSewingCost) return;
    setIsSavingPreset(true);
    try {
      const preset = await apiRequest<PresetResponseDto>("/presets", {
        method: "POST",
        body: { kind: "sewing_cost", value: customSewingCost, currency: "KGS" },
      });
      setSewingCostPresets((prev) => (prev.some((p) => p.id === preset.id) ? prev : [...prev, preset]));
      setUnitPrice(Number(preset.value));
      setCustomSewingCost(undefined);
      toast.success("Значение сохранено — доступно при следующем выборе");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить значение");
    } finally {
      setIsSavingPreset(false);
    }
  };

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;
  const workshopName = (id: string) => workshops.find((w) => w.id === id)?.name ?? id;
  const variantLabel = (id: string) => {
    const variant = variants.find((v) => v.id === id);
    return variant ? `${variant.size} / ${variant.color}` : id;
  };

  // Цвета модели — из её вариантов: отдельного справочника цветов нет и не
  // нужно, цвет существует ровно там, где заведён вариант.
  const productColors = [...new Set(variants.map((variant) => variant.color))];

  const buildMatrix = async () => {
    const rows = colorRows.filter((row) => row.color && (row.quantity ?? 0) > 0);
    if (!productId || rows.length === 0) return;
    setIsPreviewing(true);
    try {
      const preview = await apiRequest<PreviewProductionOrderVariantsResponseDto>(
        "/production-orders/preview-variants",
        {
          method: "POST",
          body: { productId, colors: rows.map((row) => ({ color: row.color, quantity: row.quantity })), distributionMode },
        },
      );
      setMatrix(preview);
      setMatrixQuantities(
        Object.fromEntries(preview.rows.map((row) => [row.productVariantId, row.quantity])),
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось рассчитать раскладку");
    } finally {
      setIsPreviewing(false);
    }
  };

  const matrixSizes = matrix ? [...new Set(matrix.rows.map((row) => row.size))] : [];
  const matrixColors = matrix ? [...new Set(matrix.rows.map((row) => row.color))] : [];
  const matrixCell = (size: string, color: string) =>
    matrix?.rows.find((row) => row.size === size && row.color === color);
  const matrixTotal = Object.values(matrixQuantities).reduce((sum, value) => sum + (value || 0), 0);

  const addLine = () => {
    if (!pendingVariantId || !pendingQuantity) return;
    setLines((prev) => [...prev, { productVariantId: pendingVariantId, quantity: pendingQuantity }]);
    setPendingVariantId("");
    setPendingQuantity(undefined);
  };

  // Строки заказа: из матрицы, если она построена, иначе из построчного ввода
  // (прежний путь сохраняется — он остаётся запасным).
  const effectiveLines: ProductionOrderVariantDraft[] = matrix
    ? Object.entries(matrixQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([productVariantId, quantity]) => ({ productVariantId, quantity }))
    : lines;
  const totalQuantity = effectiveLines.reduce((sum, line) => sum + line.quantity, 0);

  // ПРОМПТ №3, раздел 6 — материалы/BOM не показываются и не проверяются в
  // этом визарде: предпросмотр потребности в материалах убран вместе с
  // требованием approvedBom (backend сам находит/заводит BOM прозрачно).

  const submitOrder = async () => {
    if (!productId || !workshopId || !unitPrice || effectiveLines.length === 0) return;
    setIsSubmitting(true);
    try {
      await apiRequest("/production-orders", {
        method: "POST",
        body: {
          productId,
          workshopId,
          plannedQuantity: totalQuantity,
          agreedUnitPrice: unitPrice,
          dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : undefined,
          variants: effectiveLines,
        },
      });
      setProductId("");
      setWorkshopId("");
      setUnitPrice(undefined);
      setDueDate(undefined);
      setLines([]);
      setColorRows([]);
      setMatrix(null);
      setMatrixQuantities({});
      await reload();
      toast.success("Заказ пошива создан", { description: "Черновик добавлен в список ниже" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать заказ пошива");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmOrder = async (orderId: string) => {
    setPendingOrderAction(orderId);
    try {
      await apiRequest(`/production-orders/${orderId}/confirm`, { method: "POST" });
      await reload();
      toast.success("Заказ подтверждён");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось подтвердить заказ");
    } finally {
      setPendingOrderAction(null);
    }
  };

  // P0-1 (владелец проекта, 2026-09-05) — переходы, которые сегодня приходят
  // только через Telegram-ответ цеха. Единственный способ провести партию
  // дальше «Размещён» из интерфейса, пока Telegram не настроен ни для
  // одного цеха на пилоте. Метки и граф переходов — в общем месте
  // (../lib/production-order-status-labels), тот же источник, что и у
  // BatchPassportPage (владелец проекта, 2026-09-22 — раньше были
  // задублированы дословно в обоих файлах).
  const changeStatus = async (orderId: string, status: ManualOrderStatus) => {
    setPendingOrderAction(orderId);
    try {
      await apiRequest(`/production-orders/${orderId}/status`, { method: "POST", body: { status } });
      await reload();
      toast.success(`Заказ переведён «${ORDER_STATUS_LABELS[status]}»`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сменить статус заказа");
    } finally {
      setPendingOrderAction(null);
    }
  };

  // Приёмка по факту (P0-1, владелец проекта, 2026-09-07): "ordered ≠
  // received" — оператор видит план по каждому варианту и вводит
  // фактически полученное количество (по умолчанию равно плану, если
  // расхождений не было). Отдельный диалог, а не инлайн-поле в строке
  // списка — на партию может приходиться несколько десятков вариантов
  // размер×цвет, что не поместится в строку таблицы.
  const openReceiveDialog = async (order: ProductionOrderResponseDto) => {
    setReceivingOrder(order);
    setReceivingWarehouseId("");
    const quantities: Record<string, number> = {};
    for (const variant of order.variants) quantities[variant.productVariantId] = Number(variant.quantity);
    setReceivingQuantities(quantities);
    try {
      const productVariants = await apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${order.productId}`);
      setReceivingVariants(productVariants);
    } catch {
      setReceivingVariants([]);
    }
  };

  const closeReceiveDialog = () => {
    setReceivingOrder(null);
    setReceivingVariants([]);
    setReceivingQuantities({});
  };

  const receivingVariantLabel = (productVariantId: string) => {
    const variant = receivingVariants.find((v) => v.id === productVariantId);
    return variant ? `${variant.size} / ${variant.color}` : productVariantId;
  };

  const receivingPlannedTotal = receivingOrder
    ? receivingOrder.variants.reduce((sum, v) => sum + Number(v.quantity), 0)
    : 0;
  const receivingActualTotal = Object.values(receivingQuantities).reduce((sum, value) => sum + (value || 0), 0);

  const submitReceive = async () => {
    if (!receivingOrder || !receivingWarehouseId) {
      toast.error("Выберите склад для приёмки");
      return;
    }
    setPendingOrderAction(receivingOrder.id);
    try {
      await apiRequest(`/production-orders/${receivingOrder.id}/receive`, {
        method: "POST",
        body: {
          warehouseId: receivingWarehouseId,
          receivedVariants: receivingOrder.variants.map((variant) => ({
            productVariantId: variant.productVariantId,
            quantity: receivingQuantities[variant.productVariantId] ?? Number(variant.quantity),
          })),
        },
      });
      await reload();
      toast.success("Партия принята на склад по фактическому количеству");
      closeReceiveDialog();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось принять партию");
    } finally {
      setPendingOrderAction(null);
    }
  };

  // Поиск и суммы считаются по уже загруженному списку — дополнительных
  // запросов к API нет.
  const q = query.trim().toLowerCase();
  const visibleOrders = orders.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    if (!q) return true;
    return (
      productName(row.productId).toLowerCase().includes(q) ||
      workshopName(row.workshopId).toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Заказы пошива"
        subtitle={`${formatQuantity(orders.length, "заказов")} в системе`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Заказы пошива" }]} />}
      />

      {referenceError ? (
        <ErrorState
          title="Не удалось загрузить справочники"
          description="Модели, цеха и склады недоступны — проверьте соединение."
          onRetry={loadReferences}
        />
      ) : (
        // Форма создания свёрнута (визуальная переработка 2026-09-13):
        // на 390px она занимала весь первый экран, и список партий — то,
        // ради чего этот экран открывают чаще всего — начинался ниже сгиба.
        // Сама форма и её логика не изменены, только убрана из-под первого
        // взгляда: создание заказа здесь — редкое действие, основной путь
        // теперь Модель → Спецификация → Партия.
        // ПРОМПТ №3, раздел 1 — визард в новом порядке: модель (фото/название
        // подтягиваются сами) → цвета/количество → распределение размеров →
        // матрица → стоимость пошива (пресеты) → цех → создать. Без BOM,
        // материалов и проверки склада (раздел 6 — явные исключения).
        <Accordion title="Создать производственную партию" hint="модель → количество → цех">
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Модель
              <Combobox
                value={productId}
                onChange={setProductId}
                placeholder="Выберите модель"
                searchPlaceholder="Поиск модели..."
                options={products.map((product) => ({ value: product.id, label: product.name }))}
              />
            </label>

            {productId && (
              <div className="flex items-center gap-3 rounded-[12px] border border-border bg-secondary/40 p-3">
                {selectedProductPhotoUrl ? (
                  <img src={selectedProductPhotoUrl} alt="" className="h-12 w-12 rounded-[8px] object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-[8px] bg-muted" />
                )}
                <span className="t-object">{productName(productId)}</span>
              </div>
            )}

            {/* Матрица размер × цвет. Выбираем цвета с количеством, система
                раскладывает по размерам из карточки модели, ячейки можно
                поправить руками — и только потом сохранить. */}
            <div className="flex flex-col gap-3 rounded-[16px] border border-border bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[0.9rem] font-semibold">Цвета и количество</span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!productId || productColors.length === 0}
                  onClick={() => setColorRows((prev) => [...prev, { color: "", quantity: undefined }])}
                >
                  Добавить цвет
                </Button>
              </div>

              {/* Режим распределения размеров (ПРОМПТ №3, раздел 3) —
                  "Равномерно" делит количество поровну между размерами,
                  "Стандарт производства" — по весам размерного ряда модели. */}
              {colorRows.length > 0 && (
                <div className="flex items-center gap-1 self-start rounded-[10px] border border-border bg-secondary/40 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDistributionMode("even")}
                    className={cn(
                      "rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                      distributionMode === "even" ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    Равномерно
                  </button>
                  <button
                    type="button"
                    onClick={() => setDistributionMode("ratio")}
                    className={cn(
                      "rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium transition-colors",
                      distributionMode === "ratio" ? "bg-card shadow-sm" : "text-muted-foreground",
                    )}
                  >
                    Стандарт производства
                  </button>
                </div>
              )}

              {colorRows.map((row, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[150px] flex-1 flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                    Цвет
                    <Select
                      value={row.color}
                      onValueChange={(value) =>
                        setColorRows((prev) => prev.map((r, i) => (i === index ? { ...r, color: value } : r)))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите цвет" />
                      </SelectTrigger>
                      <SelectContent>
                        {productColors.map((color) => (
                          <SelectItem key={color} value={color}>
                            {color}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="flex min-w-[120px] flex-1 flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                    Количество
                    <NumberInput
                      value={row.quantity}
                      onChange={(value) =>
                        setColorRows((prev) => prev.map((r, i) => (i === index ? { ...r, quantity: value } : r)))
                      }
                      min={0}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setColorRows((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Убрать
                  </Button>
                </div>
              ))}

              {colorRows.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  className="sm:self-start"
                  loading={isPreviewing}
                  onClick={() => void buildMatrix()}
                >
                  Разложить по размерам
                </Button>
              )}

              {matrix && (
                <div className="mt-1">
                  {matrix.usedFallbackRatio && (
                    <p className="mb-2 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] font-medium text-warning">
                      У модели не задан размерный ряд — количество разделено поровну. Задайте раскладку в карточке модели.
                    </p>
                  )}
                  {matrix.missingVariants.length > 0 && (
                    <p className="mb-2 rounded-[10px] border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] font-medium text-warning">
                      Нет варианта модели для:{" "}
                      {matrix.missingVariants.map((row) => `${row.size} / ${row.color}`).join(", ")} — эти сочетания в заказ не попадут.
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[320px] border-collapse text-[13px]">
                      <thead>
                        <tr>
                          <th className="border border-border px-2 py-1.5 text-left font-medium">Размер</th>
                          {matrixColors.map((color) => (
                            <th key={color} className="border border-border px-2 py-1.5 text-right font-medium">
                              {color}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {matrixSizes.map((size) => (
                          <tr key={size}>
                            <td className="border border-border px-2 py-1 font-medium">{size}</td>
                            {matrixColors.map((color) => {
                              const cell = matrixCell(size, color);
                              return (
                                <td key={color} className="border border-border p-0.5">
                                  {cell ? (
                                    <NumberInput
                                      value={matrixQuantities[cell.productVariantId] ?? 0}
                                      onChange={(value) =>
                                        setMatrixQuantities((prev) => ({
                                          ...prev,
                                          [cell.productVariantId]: value ?? 0,
                                        }))
                                      }
                                      min={0}
                                    />
                                  ) : (
                                    <span className="block px-2 py-1 text-right text-muted-foreground">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                        <tr>
                          <td className="border border-border px-2 py-1.5 font-semibold">Итого</td>
                          {matrixColors.map((color) => (
                            <td key={color} className="num border border-border px-2 py-1.5 text-right font-semibold">
                              {formatQuantity(
                                matrixSizes.reduce((sum, size) => {
                                  const cell = matrixCell(size, color);
                                  return sum + (cell ? (matrixQuantities[cell.productVariantId] ?? 0) : 0);
                                }, 0),
                              )}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="t-meta mt-2">
                    Всего по заказу: {formatQuantity(matrixTotal, "изделий")}. Ячейки можно поправить вручную — после
                    сохранения эти числа закрепятся за заказом и правка карточки модели их не изменит.
                  </p>
                </div>
              )}
            </div>

            {/* Стоимость пошива — сохранённые значения вместо повторного
                ручного ввода (ПРОМПТ №3, раздел 5): 350/380/450 сом плюс
                возможность добавить и сохранить своё. */}
            <div className="flex flex-col gap-2">
              <span className="text-[0.9rem] font-semibold text-muted-foreground">Стоимость пошива за единицу</span>
              <div className="flex flex-wrap items-center gap-2">
                {sewingCostPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setUnitPrice(Number(preset.value))}
                    className={cn(
                      "rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors",
                      unitPrice === Number(preset.value)
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/30",
                    )}
                  >
                    {formatQuantity(Number(preset.value))} {preset.currency === "KGS" ? "сом" : preset.currency}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex w-[140px] flex-col gap-1.5 text-[12px] font-medium text-muted-foreground">
                  Своё значение
                  <NumberInput value={customSewingCost} onChange={setCustomSewingCost} min={0} />
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={isSavingPreset}
                  disabled={!customSewingCost}
                  onClick={() => void addSewingCostPreset()}
                >
                  Сохранить и выбрать
                </Button>
              </div>
            </div>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Цех
              <Combobox
                value={workshopId}
                onChange={setWorkshopId}
                placeholder="Выберите цех"
                searchPlaceholder="Поиск цеха..."
                options={workshops.map((workshop) => ({ value: workshop.id, label: workshop.name }))}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Срок сдачи (необязательно)
              <DatePicker value={dueDate} onChange={setDueDate} />
            </label>

            <div className="flex flex-col gap-3 rounded-[16px] bg-secondary p-3.5 sm:flex-row sm:items-end sm:flex-wrap">
              <label className="flex flex-1 min-w-[140px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                Размер и цвет
                <Select value={pendingVariantId} onValueChange={setPendingVariantId} disabled={!productId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Размер / цвет" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.size} / {variant.color}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-1 min-w-[100px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                Количество
                <NumberInput value={pendingQuantity} onChange={setPendingQuantity} min={0} />
              </label>
              <Button type="button" variant="secondary" size="sm" onClick={addLine}>
                Добавить строку
              </Button>
            </div>

            {!matrix && lines.length > 0 && (
              <ul className="m-0 list-none p-0 text-[0.9rem] text-muted-foreground">
                {lines.map((line, index) => (
                  <li key={index} className="flex justify-between border-b border-border py-1.5 last:border-none">
                    <span>{variantLabel(line.productVariantId)}</span>
                    <span className="tabular-nums">{line.quantity} шт</span>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              loading={isSubmitting}
              disabled={!productId || !workshopId || !unitPrice || effectiveLines.length === 0}
              onClick={() => void submitOrder()}
            >
              {isSubmitting ? "Создаём заказ..." : "Создать заказ пошива"}
            </Button>
          </div>
        </Accordion>
      )}

      {isLoading && <SkeletonList />}

      {/* Поиск и фильтры — как в BatchesScreen прототипа: поле слева,
          чипы справа, на мобильном друг под другом. */}
      <div className="mb-3 mt-5 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Поиск по модели или цеху"
          className="md:w-[340px]"
        />
        <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {!isLoading && orders.length === 0 ? (
        <EmptyState
          compact
          title="Пока нет ни одного заказа пошива"
          description="Партия создаётся из утверждённой спецификации — или вручную через «Новый заказ пошива» выше."
        />
      ) : !isLoading && visibleOrders.length === 0 ? (
        <EmptyState
          compact
          title="Ничего не найдено"
          description="По заданным условиям поиска и фильтрам заказов нет. Измените запрос или сбросьте фильтр."
          action={
            <Button
              size="sm"
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
              }}
            >
              Сбросить фильтры
            </Button>
          }
        />
      ) : (
        // BatchCard (Model-first Minimal Core, ПРОМПТ №06.1 §2) заменяет
        // здесь и таблицу, и отдельную мобильную вёрстку — сама карточка уже
        // адаптивна (Drawer/Accordion), поэтому одна сетка работает на всех
        // экранах. Действия смены статуса — та же логика, что была в
        // таблице/мобильных карточках, перенесена в слот `actions` без
        // изменений.
        //
        // 2 колонки — с lg (1024px), не с md (768px, ПРОМПТ №08.3): на
        // ширинах 768-1023px рельс навигации (260px) съедает столько места,
        // что вторая колонка сжимает карточку сильнее, чем на мобильном в
        // один столбец — «Срок» наезжал на «Объём партии», номер партии
        // обрезался. Один столбец на этом промежутке — не хуже, а честнее.
        //
        // 3 колонки — с 2xl (1536px), не с xl (1280px, тот же промпт): на
        // 1280px карточка в 3 столбца сужается до ~290px — при длинном
        // статусе («Готово к отгрузке») номер партии обрезался («ПР-2026-
        // 00…») в самой первой строке шапки, где обрезание недопустимо:
        // это единственный на экране идентификатор партии.
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {visibleOrders.map((row) => {
            const variantsById = new Map(
              (variantsByProduct[row.productId] ?? []).map((variant) => [variant.id, variant]),
            );
            const spec = row.specificationId ? specifications.find((s) => s.id === row.specificationId) : undefined;
            const cardData = buildBatchCardFromOrder(
              row,
              productName(row.productId),
              workshopName(row.workshopId),
              photoByProduct[row.productId] ?? null,
              spec?.specNumber ?? null,
              variantsById,
            );
            return (
              <BatchCard
                key={row.id}
                data={cardData}
                onClick={() => void navigate(`/production-orders/${row.id}`)}
                onSpecificationClick={row.specificationId ? () => void navigate(`/specifications/${row.specificationId}`) : undefined}
                // Переключатель «Завершена» выполняет существующую операцию
                // приёмки (POST /production-orders/:id/receive). Приёмка
                // требует склада и фактических количеств по каждому
                // размеру×цвету, поэтому открывается уже существующий диалог
                // приёмки, а не отправляется запрос вслепую. Обратной
                // операции в backend нет — переключатель после приёмки
                // блокируется сам (lib/batch-completion.ts).
                onRequestComplete={() => void openReceiveDialog(row)}
                completionPending={pendingOrderAction === row.id}
                actions={
                  row.status === "draft" ? (
                    <Button type="button" size="sm" loading={pendingOrderAction === row.id} onClick={() => void confirmOrder(row.id)}>
                      Подтвердить
                    </Button>
                  ) : NEXT_STATUS[row.status] ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      loading={pendingOrderAction === row.id}
                      onClick={() => void changeStatus(row.id, NEXT_STATUS[row.status])}
                    >
                      {ORDER_STATUS_LABELS[NEXT_STATUS[row.status]]}
                    </Button>
                  ) : undefined
                  // Отдельной кнопки «Принять партию» здесь больше нет:
                  // в статусе "ready_for_pickup" эту же операцию выполняет
                  // переключатель «Завершена». Две кнопки для одного
                  // действия читались бы как два разных действия.
                }
              />
            );
          })}
        </div>
      )}

      {/* Диалог фактической приёмки (P0-1) — план показывается рядом с
          редактируемым фактом по каждому варианту размер×цвет, плюс
          отклонение по сумме; на склад зачисляется факт, а не план. */}
      <Dialog open={receivingOrder !== null} onOpenChange={(open) => (!open ? closeReceiveDialog() : undefined)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Приёмка партии</DialogTitle>
          </DialogHeader>
          {receivingOrder ? (
            <div className="space-y-4">
              <div>
                <label className="t-meta mb-1.5 block">Склад приёмки</label>
                <Select value={receivingWarehouseId} onValueChange={setReceivingWarehouseId}>
                  <SelectTrigger className="w-full">
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
              </div>

              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                <div className="grid grid-cols-[1fr_90px_90px] gap-2 text-[11px] font-medium uppercase text-muted-foreground">
                  <span>Вариант</span>
                  <span className="text-right">План</span>
                  <span className="text-right">Факт</span>
                </div>
                {receivingOrder.variants.map((variant) => (
                  <div key={variant.id} className="grid grid-cols-[1fr_90px_90px] items-center gap-2">
                    <span className="text-[13px]">{receivingVariantLabel(variant.productVariantId)}</span>
                    <span className="num text-right text-[13px] text-muted-foreground">
                      {formatQuantity(Number(variant.quantity))}
                    </span>
                    <NumberInput
                      className="text-right"
                      min={0}
                      value={receivingQuantities[variant.productVariantId]}
                      onChange={(value) =>
                        setReceivingQuantities((prev) => ({ ...prev, [variant.productVariantId]: value ?? 0 }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-[1fr_90px_90px] gap-2 border-t border-border pt-2.5 text-[13px] font-medium">
                <span>Итого</span>
                <span className="num text-right">{formatQuantity(receivingPlannedTotal)}</span>
                <span className="num text-right">{formatQuantity(receivingActualTotal)}</span>
              </div>
              {receivingActualTotal !== receivingPlannedTotal ? (
                <p className="t-meta text-warning">
                  Отклонение от плана: {formatQuantity(receivingActualTotal - receivingPlannedTotal)} шт.
                </p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={closeReceiveDialog}>
              Отмена
            </Button>
            <Button
              type="button"
              loading={receivingOrder ? pendingOrderAction === receivingOrder.id : false}
              disabled={!receivingWarehouseId}
              onClick={() => void submitReceive()}
            >
              Принять партию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
