import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type BomResponseDto,
  type MaterialResponseDto,
  type ProductResponseDto,
  type ProductVariantResponseDto,
  type ProductionOrderResponseDto,
  type PreviewProductionOrderVariantsResponseDto,
  type ProductionOrderVariantDraft,
  type WarehouseResponseDto,
  type WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Button } from "../design-system/Button/Button";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { SearchBar } from "../design-system/Search/SearchBar";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { formatDate, formatMoney, formatQuantity, unitLabel } from "../lib/format";
import { computeProductionOrderBatchSum } from "../lib/production-order-pricing";
import { cn } from "../design-system/utils";
import { Combobox } from "../design-system/Select/Combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { MoneyInput, NumberInput } from "../design-system/Input/NumberInput";
import { DatePicker } from "../design-system/Form/DatePicker";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { Tooltip, TooltipContent, TooltipTrigger } from "../design-system/Tooltip/Tooltip";
import { toast } from "../design-system/Toast/Toast";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../design-system/Modal/Dialog";

// Форма-эталон (docs/UI_FOUNDATION.md, шаг 5) — первый экран, полностью
// собранный из GarmentInput/GarmentSelect/GarmentDatePicker/GarmentButton/
// GarmentCard вместо голого HTML. После утверждения владельцем — образец
// для переноса остальных 7 форм (не переносятся в этом же цикле работ).
const STATUS_FILTERS: FilterOption<"all" | "draft" | "placed" | "in_progress" | "ready_for_pickup" | "received">[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновик" },
  { value: "placed", label: "Размещён" },
  { value: "in_progress", label: "В работе" },
  { value: "ready_for_pickup", label: "Готово" },
  { value: "received", label: "Принято" },
];

export function ProductionOrdersPage() {
  const navigate = useNavigate();
  const { items: orders, isLoading, reload } = useCrudResource<ProductionOrderResponseDto, never>("/production-orders");
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponseDto[]>([]);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);
  const [approvedBom, setApprovedBom] = useState<BomResponseDto | null>(null);

  const [productId, setProductId] = useState("");
  const [workshopId, setWorkshopId] = useState("");
  const [unitPrice, setUnitPrice] = useState<number | undefined>(undefined);
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [lines, setLines] = useState<ProductionOrderVariantDraft[]>([]);
  // Матрица размер × цвет: выбираем цвета с количеством, система раскладывает
  // по размерам, пользователь при необходимости правит отдельные ячейки —
  // и только потом сохраняет (владелец проекта, 2026-08-30).
  const [colorRows, setColorRows] = useState<Array<{ color: string; quantity: number | undefined }>>([]);
  const [matrix, setMatrix] = useState<PreviewProductionOrderVariantsResponseDto | null>(null);
  const [matrixQuantities, setMatrixQuantities] = useState<Record<string, number>>({});
  const [isPreviewing, setIsPreviewing] = useState(false);

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

  const loadReferences = () => {
    setReferenceError(false);
    Promise.all([
      apiRequest<ProductResponseDto[]>("/products").then(setProducts),
      apiRequest<WorkshopResponseDto[]>("/workshops").then(setWorkshops),
      apiRequest<WarehouseResponseDto[]>("/warehouses").then(setWarehouses),
      // Материалы нужны, чтобы показать потребность по нормам понятными
      // словами («ткань, 1 365 м»), а не идентификаторами.
      apiRequest<MaterialResponseDto[]>("/materials").then(setMaterials),
    ]).catch(() => setReferenceError(true));
  };

  useEffect(() => {
    loadReferences();
  }, []);

  useEffect(() => {
    if (!productId) {
      setVariants([]);
      setApprovedBom(null);
      return;
    }
    void apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`).then(setVariants);
    apiRequest<BomResponseDto>(`/boms/approved?productId=${productId}`)
      .then(setApprovedBom)
      .catch(() => setApprovedBom(null));
  }, [productId]);

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
          body: { productId, colors: rows.map((row) => ({ color: row.color, quantity: row.quantity })) },
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

  // Предварительный расчёт потребности в материалах: сколько ткани и
  // фурнитуры уйдёт на набранное количество. Показывается до создания
  // заказа — чтобы решение «делать партию 500 или 300» принималось со
  // знанием, хватит ли материала, а не постфактум.
  //
  // Формула та же, что применяет сервер к зафиксированным нормам партии
  // (apps/api/src/reporting/batch-passport.service.ts, computeMaterialRequirement):
  // расход на изделие = норма × (1 + отходы%), потребность = расход × количество.
  // Это именно предварительный расчёт по сегодняшним нормам модели —
  // окончательные числа партии определяются нормами, которые зафиксируются
  // при подтверждении заказа.
  const previewRequirement =
    approvedBom && totalQuantity > 0
      ? approvedBom.items.flatMap((item) => {
          const material = materials.find((row) => row.id === item.materialId);
          if (!material) return [];
          const consumptionPerUnit = Number(item.quantityPerUnit) * (1 + Number(item.wastePercent) / 100);
          return [
            {
              materialId: item.materialId,
              name: material.name,
              unit: material.unit,
              consumptionPerUnit,
              totalRequired: consumptionPerUnit * totalQuantity,
            },
          ];
        })
      : [];

  const submitOrder = async () => {
    if (!productId || !workshopId || !approvedBom || !unitPrice || effectiveLines.length === 0) return;
    setIsSubmitting(true);
    try {
      await apiRequest("/production-orders", {
        method: "POST",
        body: {
          productId,
          bomId: approvedBom.id,
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
  // одного цеха на пилоте.
  const changeStatus = async (orderId: string, status: "in_progress" | "ready_for_pickup") => {
    setPendingOrderAction(orderId);
    try {
      await apiRequest(`/production-orders/${orderId}/status`, { method: "POST", body: { status } });
      await reload();
      toast.success(status === "in_progress" ? "Заказ переведён «В работе»" : "Заказ переведён «Готово к отгрузке»");
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

  // «Сумма партии» — считается по строкам (P5-2): rework-строки бесплатны,
  // new-строки — по согласованной с цехом цене. Для заказа без rework-строк
  // результат тот же, что и раньше (agreedUnitPrice × plannedQuantity).
  // Раньше здесь была цена из снимка за вычетом 175 — смысл этого вычета
  // владельцем проекта не подтверждён, показатели на нём не строятся.
  const batchAmount = (row: ProductionOrderResponseDto): number => computeProductionOrderBatchSum(row);

  // Просрочка считается на клиенте из dueDate по тому же правилу, что и в
  // apps/api/src/reporting/attention.service.ts: срок в прошлом и заказ не
  // в терминальном статусе. Отдельного поля в списке API не отдаёт.
  const overdueDays = (row: ProductionOrderResponseDto): number | null => {
    if (!row.dueDate || row.status === "received" || row.status === "cancelled") return null;
    const due = new Date(row.dueDate);
    if (Number.isNaN(due.getTime())) return null;
    const today = new Date();
    const diff = Math.floor((today.setHours(0, 0, 0, 0) - due.setHours(0, 0, 0, 0)) / 86_400_000);
    return diff > 0 ? diff : null;
  };

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
        <Card>
          <CardHeader>
            <CardTitle>Новый заказ пошива</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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

            {productId && !approvedBom && (
              <p className="text-[0.85rem] font-semibold text-destructive">
                У этой модели не заданы нормы расхода материалов — задайте их на карточке модели.
              </p>
            )}

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
              <span className="inline-flex items-center gap-1.5">
                Цена пошива за единицу
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="h-4 min-h-0 w-4 rounded-full bg-transparent p-0 text-muted-foreground/70 shadow-none hover:text-muted-foreground"
                      aria-label="Пояснение"
                    >
                      <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                        <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M10 9v4.5M10 6.5v.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Расчёты с цехами ведутся в рублях (docs/PRINCIPLES.md, принцип 21)</TooltipContent>
                </Tooltip>
              </span>
              <MoneyInput currency="₽" value={unitPrice} onChange={setUnitPrice} />
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Срок сдачи
              <DatePicker value={dueDate} onChange={setDueDate} />
            </label>

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

            {previewRequirement.length > 0 && (
              <div className="rounded-[16px] border border-border bg-secondary/50 p-3.5">
                <div className="text-[0.9rem] font-semibold">
                  Потребуется материалов на {formatQuantity(totalQuantity, "изделий")}
                </div>
                <ul className="m-0 mt-2 list-none p-0 text-[0.9rem] text-muted-foreground">
                  {previewRequirement.map((row) => (
                    <li key={row.materialId} className="flex justify-between gap-3 border-b border-border py-1.5 last:border-none">
                      <span>{row.name}</span>
                      <span className="tabular-nums">
                        {formatQuantity(row.totalRequired, unitLabel(row.unit), 2)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[0.8rem] text-muted-foreground">
                  Предварительно, по нормам расхода из карточки модели. Нормы этой партии зафиксируются при
                  подтверждении заказа и дальше меняться не будут.
                </p>
              </div>
            )}

            <Button
              type="button"
              loading={isSubmitting}
              disabled={!productId || !workshopId || !approvedBom || !unitPrice || effectiveLines.length === 0}
              onClick={() => void submitOrder()}
            >
              {isSubmitting ? "Создаём заказ..." : "Создать заказ пошива"}
            </Button>
          </CardContent>
        </Card>
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
          description="Создайте первый заказ в форме выше."
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
        <>
          {/* Таблица — планшет и десктоп */}
          <div className="hidden md:block">
            <DataTable
              columns={[
                { key: "model", label: "Модель" },
                { key: "workshop", label: "Цех", width: "190px" },
                { key: "qty", label: "Кол-во", align: "right", width: "100px" },
                { key: "status", label: "Статус", width: "210px" },
                { key: "amount", label: "Сумма", align: "right", width: "150px" },
                { key: "due", label: "Срок", align: "right", width: "172px" },
              ]}
            >
              {visibleOrders.map((row) => {
                const amount = batchAmount(row);
                const late = overdueDays(row);
                return (
                  <tr key={row.id} onClick={() => void navigate(`/production-orders/${row.id}`)}>
                    <Td className="t-object">{productName(row.productId)}</Td>
                    <Td className="text-muted-foreground">{workshopName(row.workshopId)}</Td>
                    <Td align="right" className="num">
                      {formatQuantity(Number(row.plannedQuantity))}
                    </Td>
                    {/* Действия живут в колонке статуса: у черновика —
                        «Подтвердить», у размещённого/в работе — переход на
                        следующий этап (P0-1, без Telegram), у готового к
                        отгрузке — выбор склада и «Принять партию». Клик по
                        ним не открывает паспорт (stopPropagation), как и
                        раньше. */}
                    <Td>
                      <div className="flex items-center justify-start gap-2" onClick={(event) => event.stopPropagation()}>
                        {row.status === "draft" ? (
                          <Button
                            type="button"
                            size="sm"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void confirmOrder(row.id)}
                          >
                            Подтвердить
                          </Button>
                        ) : row.status === "placed" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void changeStatus(row.id, "in_progress")}
                          >
                            Начали шить
                          </Button>
                        ) : row.status === "in_progress" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void changeStatus(row.id, "ready_for_pickup")}
                          >
                            Готово к отгрузке
                          </Button>
                        ) : row.status === "ready_for_pickup" ? (
                          <Button type="button" size="sm" onClick={() => void openReceiveDialog(row)}>
                            Принять
                          </Button>
                        ) : (
                          <StatusBadge status={row.status} />
                        )}
                      </div>
                    </Td>
                    <Td align="right" className="t-amount">
                      {formatMoney(amount, "руб")}
                    </Td>
                    <Td align="right">
                      {row.dueDate ? (
                        <span className="num">
                          {formatDate(row.dueDate)}
                          {late ? (
                            <span className="mt-0.5 block whitespace-nowrap text-[11px] text-danger">
                              просрочено на {late} дн.
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">срока нет</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </DataTable>
          </div>

          {/* Карточки — мобильная композиция прототипа */}
          <div className="space-y-2 md:hidden">
            {visibleOrders.map((row) => {
              const amount = batchAmount(row);
              const late = overdueDays(row);
              return (
                <MobileListItem
                  key={row.id}
                  onClick={() => void navigate(`/production-orders/${row.id}`)}
                  footer={
                    row.status === "draft" ||
                    row.status === "placed" ||
                    row.status === "in_progress" ||
                    row.status === "ready_for_pickup" ? (
                      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                        {row.status === "draft" ? (
                          <Button
                            type="button"
                            size="sm"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void confirmOrder(row.id)}
                          >
                            Подтвердить
                          </Button>
                        ) : row.status === "placed" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void changeStatus(row.id, "in_progress")}
                          >
                            Начали шить
                          </Button>
                        ) : row.status === "in_progress" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void changeStatus(row.id, "ready_for_pickup")}
                          >
                            Готово к отгрузке
                          </Button>
                        ) : (
                          <Button type="button" size="sm" onClick={() => void openReceiveDialog(row)}>
                            Принять партию
                          </Button>
                        )}
                      </div>
                    ) : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium">{productName(row.productId)}</div>
                      <div className="mt-1 text-[12px] text-muted-foreground">{workshopName(row.workshopId)}</div>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <dl className="num mt-2.5 grid grid-cols-2 gap-y-1.5 border-t border-border pt-2.5 text-[12px]">
                    <dt className="text-muted-foreground">Количество</dt>
                    <dd className="text-right">{formatQuantity(Number(row.plannedQuantity), "шт")}</dd>
                    <dt className="text-muted-foreground">Сумма</dt>
                    <dd className="t-amount text-right">
                      {formatMoney(amount, "руб")}
                    </dd>
                    <dt className="text-muted-foreground">Срок</dt>
                    <dd className={cn("text-right", late && "text-danger")}>
                      {row.dueDate ? formatDate(row.dueDate) : "срока нет"}
                      {late ? ` · просрочено на ${late} дн.` : ""}
                    </dd>
                  </dl>
                </MobileListItem>
              );
            })}
          </div>
        </>
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
