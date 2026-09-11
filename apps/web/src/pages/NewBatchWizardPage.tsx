import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  BomResponseDto,
  MaterialResponseDto,
  PreviewProductionOrderVariantsResponseDto,
  ProductResponseDto,
  ProductSizeResponseDto,
  ProductVariantResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Input } from "../design-system/Input/Input";
import { MoneyInput, NumberInput } from "../design-system/Input/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { Combobox } from "../design-system/Select/Combobox";
import { Button } from "../design-system/Button/Button";
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { unitLabel } from "../lib/format";
import { cn } from "../design-system/utils";

// Мастер новой партии (владелец проекта, 2026-09-11 — реакция на первое
// реальное прохождение пилота: «слишком много кликов, между экранами нет
// связующей памяти, поля не предзаполнены»). Не заменяет отдельные разделы
// (/workshops, /materials, /products, /production-orders) — они остаются
// источником полного CRUD и правки задним числом (docs/UI_MIGRATION_PLAN.md
// эти разделы не отменяет). Мастер — это тот же самый набор эндпоинтов,
// собранный в один линейный проход без переходов по вкладкам: выбор цеха →
// материал → модель → размеры → цвет → BOM → заказ, где id, выбранный на
// шаге N, автоматически становится значением по умолчанию на шаге N+1.
//
// Каждый шаг — либо выбор существующей записи (Combobox), либо создание
// новой прямо здесь, без ухода со страницы. Ни один backend-эндпоинт не
// добавлен: это тот же API, которым уже пользуются WorkshopsPage/
// MaterialsPage/ProductsPage/ProductDetailPage/ProductionOrdersPage.

const MATERIAL_TYPES: FilterOption<"fabric" | "trim" | "packaging" | "accessory">[] = [
  { value: "fabric", label: "Ткани" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "accessory", label: "Прочее" },
];
const MATERIAL_UNITS = [
  { value: "m", label: "м (метры)" },
  { value: "kg", label: "кг (килограммы)" },
  { value: "pcs", label: "шт (штуки)" },
] as const;

interface SizeRow {
  size: string;
  ratioWeight: number | undefined;
}

const DEFAULT_SIZE_ROWS: SizeRow[] = [
  { size: "S", ratioWeight: 1 },
  { size: "M", ratioWeight: 2 },
  { size: "L", ratioWeight: 2 },
  { size: "XL", ratioWeight: 1 },
];

interface BomRow {
  materialId: string;
  quantityPerUnit: number | undefined;
  wastePercent: number | undefined;
}

const STEP_ORDER = ["workshop", "material", "product", "sizes", "color", "bom", "order"] as const;
type StepKey = (typeof STEP_ORDER)[number];

const STEP_TITLES: Record<StepKey, string> = {
  workshop: "Цех",
  material: "Материал",
  product: "Модель",
  sizes: "Размерный ряд",
  color: "Цвет / вариант",
  bom: "Спецификация (BOM)",
  order: "Производственный заказ",
};

function StepBadge({ index, state }: { index: number; state: "done" | "current" | "pending" }) {
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold",
        state === "done" && "bg-primary/15 text-primary",
        state === "current" && "bg-primary text-primary-foreground",
        state === "pending" && "bg-muted text-muted-foreground",
      )}
    >
      {state === "done" ? "✓" : index}
    </span>
  );
}

export function NewBatchWizardPage() {
  const navigate = useNavigate();

  // ---- Справочники (совпадают с теми же списками, что и на отдельных
  // страницах — мастер не заводит параллельного источника данных). ----
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [refsError, setRefsError] = useState<string | null>(null);

  const loadRefs = () => {
    setIsLoadingRefs(true);
    setRefsError(null);
    Promise.all([
      apiRequest<WorkshopResponseDto[]>("/workshops").then(setWorkshops),
      apiRequest<MaterialResponseDto[]>("/materials").then(setMaterials),
      apiRequest<ProductResponseDto[]>("/products").then(setProducts),
    ]).catch((err: unknown) => setRefsError(err instanceof ApiError ? err.message : "Не удалось загрузить справочники")).finally(() =>
      setIsLoadingRefs(false),
    );
  };
  useEffect(loadRefs, []);

  // ---- Готовность шагов + цепочка id между ними ----
  const [done, setDone] = useState<Record<StepKey, boolean>>({
    workshop: false,
    material: false,
    product: false,
    sizes: false,
    color: false,
    bom: false,
    order: false,
  });
  const reopenFrom = (step: StepKey) => {
    const idx = STEP_ORDER.indexOf(step);
    setDone((prev) => {
      const next = { ...prev };
      STEP_ORDER.slice(idx).forEach((key) => {
        next[key] = false;
      });
      return next;
    });
  };
  const isUnlocked = (step: StepKey) => {
    const idx = STEP_ORDER.indexOf(step);
    return idx === 0 || done[STEP_ORDER[idx - 1]];
  };

  // ---- Шаг 1: Цех ----
  const [workshopMode, setWorkshopMode] = useState<"select" | "create">("create");
  const [workshopId, setWorkshopId] = useState("");
  const [newWorkshopName, setNewWorkshopName] = useState("");
  const [newWorkshopSpecialization, setNewWorkshopSpecialization] = useState("");
  const [newWorkshopContractNumber, setNewWorkshopContractNumber] = useState("");
  const [workshopSubmitting, setWorkshopSubmitting] = useState(false);
  const [workshopError, setWorkshopError] = useState<string | null>(null);

  const submitWorkshopStep = async () => {
    setWorkshopError(null);
    if (workshopMode === "select") {
      if (!workshopId) {
        setWorkshopError("Выберите цех из списка");
        return;
      }
      setDone((prev) => ({ ...prev, workshop: true }));
      return;
    }
    if (!newWorkshopName.trim()) {
      setWorkshopError("Укажите название цеха");
      return;
    }
    if (!newWorkshopContractNumber.trim()) {
      setWorkshopError("Номер договора нужен, чтобы подтвердить заказ позже — укажите хотя бы предварительный");
      return;
    }
    setWorkshopSubmitting(true);
    try {
      const created = await apiRequest<WorkshopResponseDto>("/workshops", {
        method: "POST",
        body: {
          name: newWorkshopName.trim(),
          specialization: newWorkshopSpecialization.trim() || undefined,
          contractNumber: newWorkshopContractNumber.trim(),
        },
      });
      setWorkshops((prev) => [...prev, created]);
      setWorkshopId(created.id);
      setDone((prev) => ({ ...prev, workshop: true }));
      toast.success(`Цех «${created.name}» создан`);
    } catch (err) {
      setWorkshopError(err instanceof ApiError ? err.message : "Не удалось создать цех");
    } finally {
      setWorkshopSubmitting(false);
    }
  };

  // ---- Шаг 2: Материал ----
  const [materialMode, setMaterialMode] = useState<"select" | "create">("create");
  const [materialId, setMaterialId] = useState("");
  const [newMaterialName, setNewMaterialName] = useState("");
  const [newMaterialType, setNewMaterialType] = useState<"fabric" | "trim" | "packaging" | "accessory">("fabric");
  const [newMaterialUnit, setNewMaterialUnit] = useState<"m" | "kg" | "pcs">("kg");
  const [newMaterialReorderPoint, setNewMaterialReorderPoint] = useState<number | undefined>(undefined);
  const [materialSubmitting, setMaterialSubmitting] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);

  const submitMaterialStep = async () => {
    setMaterialError(null);
    if (materialMode === "select") {
      if (!materialId) {
        setMaterialError("Выберите материал из списка");
        return;
      }
      setDone((prev) => ({ ...prev, material: true }));
      return;
    }
    if (!newMaterialName.trim()) {
      setMaterialError("Укажите название материала");
      return;
    }
    setMaterialSubmitting(true);
    try {
      const created = await apiRequest<MaterialResponseDto>("/materials", {
        method: "POST",
        body: {
          name: newMaterialName.trim(),
          type: newMaterialType,
          unit: newMaterialUnit,
          reorderPoint: newMaterialReorderPoint,
        },
      });
      setMaterials((prev) => [...prev, created]);
      setMaterialId(created.id);
      setDone((prev) => ({ ...prev, material: true }));
      toast.success(`Материал «${created.name}» создан`);
    } catch (err) {
      setMaterialError(err instanceof ApiError ? err.message : "Не удалось создать материал");
    } finally {
      setMaterialSubmitting(false);
    }
  };

  // ---- Шаг 3: Модель ----
  const [productMode, setProductMode] = useState<"select" | "create">("create");
  const [productId, setProductId] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [productSubmitting, setProductSubmitting] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  const submitProductStep = async () => {
    setProductError(null);
    if (productMode === "select") {
      if (!productId) {
        setProductError("Выберите модель из списка");
        return;
      }
      setDone((prev) => ({ ...prev, product: true }));
      return;
    }
    if (!newProductName.trim()) {
      setProductError("Укажите название модели");
      return;
    }
    if (!newProductCode.trim()) {
      setProductError("Укажите артикул модели");
      return;
    }
    setProductSubmitting(true);
    try {
      const created = await apiRequest<ProductResponseDto>("/products", {
        method: "POST",
        body: { name: newProductName.trim(), code: newProductCode.trim() },
      });
      setProducts((prev) => [...prev, created]);
      setProductId(created.id);
      setDone((prev) => ({ ...prev, product: true }));
      toast.success(`Модель «${created.name}» создана`);
    } catch (err) {
      setProductError(err instanceof ApiError ? err.message : "Не удалось создать модель");
    } finally {
      setProductSubmitting(false);
    }
  };

  // ---- Шаг 4: Размерный ряд ----
  const [existingSizes, setExistingSizes] = useState<ProductSizeResponseDto[]>([]);
  const [sizesLoaded, setSizesLoaded] = useState(false);
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(DEFAULT_SIZE_ROWS);
  const [sizesEditing, setSizesEditing] = useState(false);
  const [sizesSubmitting, setSizesSubmitting] = useState(false);
  const [sizesError, setSizesError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !done.product) return;
    setSizesLoaded(false);
    apiRequest<ProductSizeResponseDto[]>(`/products/${productId}/sizes`)
      .then((rows) => {
        setExistingSizes(rows);
        setSizesEditing(rows.length === 0);
        if (rows.length > 0) {
          setDone((prev) => ({ ...prev, sizes: true }));
        }
      })
      .catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить размерный ряд"))
      .finally(() => setSizesLoaded(true));
    // productId меняется только при переоткрытии шага 3 — новая загрузка
    // размеров обязана произойти именно тогда.
  }, [productId, done.product]);

  const updateSizeRow = (index: number, patch: Partial<SizeRow>) => {
    setSizeRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const addSizeRow = () => setSizeRows((prev) => [...prev, { size: "", ratioWeight: 1 }]);
  const removeSizeRow = (index: number) => setSizeRows((prev) => prev.filter((_, i) => i !== index));

  const submitSizesStep = async () => {
    setSizesError(null);
    const rows = sizeRows.filter((row) => row.size.trim() && row.ratioWeight);
    if (rows.length === 0) {
      setSizesError("Добавьте хотя бы один размер с весом пропорции");
      return;
    }
    setSizesSubmitting(true);
    try {
      const saved = await apiRequest<ProductSizeResponseDto[]>(`/products/${productId}/sizes`, {
        method: "PUT",
        body: { sizes: rows.map((row) => ({ size: row.size.trim(), ratioWeight: row.ratioWeight })) },
      });
      setExistingSizes(saved);
      setSizesEditing(false);
      setDone((prev) => ({ ...prev, sizes: true }));
      toast.success("Размерный ряд сохранён");
    } catch (err) {
      setSizesError(err instanceof ApiError ? err.message : "Не удалось сохранить размерный ряд");
    } finally {
      setSizesSubmitting(false);
    }
  };

  // ---- Шаг 5: Цвет / вариант ----
  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);
  const [colorMode, setColorMode] = useState<"select" | "create">("create");
  const [orderColor, setOrderColor] = useState("");
  const [newColorName, setNewColorName] = useState("");
  const [newColorCode, setNewColorCode] = useState("");
  const [colorSubmitting, setColorSubmitting] = useState(false);
  const [colorError, setColorError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !done.sizes) return;
    setVariantsLoaded(false);
    apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`)
      .then((rows) => {
        setVariants(rows);
        const colors = [...new Set(rows.map((row) => row.color))];
        if (colors.length > 0) {
          setColorMode("select");
          setOrderColor((prev) => prev || colors[0] || "");
        } else {
          setColorMode("create");
        }
      })
      .catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить варианты модели"))
      .finally(() => setVariantsLoaded(true));
  }, [productId, done.sizes]);

  const existingColors = [...new Set(variants.map((row) => row.color))];

  const submitColorStep = async () => {
    setColorError(null);
    if (colorMode === "select") {
      if (!orderColor) {
        setColorError("Выберите цвет из списка");
        return;
      }
      setDone((prev) => ({ ...prev, color: true }));
      return;
    }
    if (!newColorName.trim() || !newColorCode.trim()) {
      setColorError("Укажите название и код цвета");
      return;
    }
    setColorSubmitting(true);
    try {
      const result = await apiRequest<{ created: number; skipped: number }>(`/products/${productId}/colors`, {
        method: "POST",
        body: { color: newColorName.trim(), colorCode: newColorCode.trim() },
      });
      const refreshed = await apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`);
      setVariants(refreshed);
      setOrderColor(newColorName.trim());
      setDone((prev) => ({ ...prev, color: true }));
      toast.success(`Цвет «${newColorName.trim()}» добавлен`, {
        description: `Создано вариантов: ${result.created}${result.skipped > 0 ? `, пропущено (уже были): ${result.skipped}` : ""}`,
      });
    } catch (err) {
      setColorError(err instanceof ApiError ? err.message : "Не удалось добавить цвет");
    } finally {
      setColorSubmitting(false);
    }
  };

  // ---- Шаг 6: BOM ----
  const [existingBoms, setExistingBoms] = useState<BomResponseDto[]>([]);
  const [bomsLoaded, setBomsLoaded] = useState(false);
  const [bomId, setBomId] = useState("");
  const [bomMode, setBomMode] = useState<"use" | "create">("create");
  const [bomRows, setBomRows] = useState<BomRow[]>([{ materialId: "", quantityPerUnit: undefined, wastePercent: 0 }]);
  const [bomSubmitting, setBomSubmitting] = useState(false);
  const [bomError, setBomError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !done.color) return;
    setBomsLoaded(false);
    apiRequest<BomResponseDto[]>(`/boms?productId=${productId}`)
      .then((rows) => {
        setExistingBoms(rows);
        const approved = rows.find((row) => row.status === "approved");
        if (approved) {
          setBomMode("use");
          setBomId(approved.id);
        } else {
          setBomMode("create");
          setBomRows((prev) =>
            prev.map((row, i) => (i === 0 && !row.materialId ? { ...row, materialId } : row)),
          );
        }
      })
      .catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить спецификации модели"))
      .finally(() => setBomsLoaded(true));
  }, [productId, done.color]);

  const updateBomRow = (index: number, patch: Partial<BomRow>) => {
    setBomRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };
  const addBomRow = () => setBomRows((prev) => [...prev, { materialId: "", quantityPerUnit: undefined, wastePercent: 0 }]);
  const removeBomRow = (index: number) => setBomRows((prev) => prev.filter((_, i) => i !== index));

  const submitBomStep = async () => {
    setBomError(null);
    if (bomMode === "use") {
      if (!bomId) {
        setBomError("Не удалось определить утверждённую спецификацию — переключитесь на создание новой");
        return;
      }
      setDone((prev) => ({ ...prev, bom: true }));
      return;
    }
    const rows = bomRows.filter((row) => row.materialId && row.quantityPerUnit);
    if (rows.length === 0) {
      setBomError("Добавьте хотя бы одну строку нормы расхода");
      return;
    }
    setBomSubmitting(true);
    try {
      const draft = await apiRequest<BomResponseDto>("/boms", {
        method: "POST",
        body: {
          productId,
          items: rows.map((row) => ({
            materialId: row.materialId,
            quantityPerUnit: row.quantityPerUnit,
            wastePercent: row.wastePercent ?? 0,
          })),
        },
      });
      const approved = await apiRequest<BomResponseDto>(`/boms/${draft.id}/approve`, { method: "POST" });
      setExistingBoms((prev) => [...prev, approved]);
      setBomId(approved.id);
      setDone((prev) => ({ ...prev, bom: true }));
      toast.success("Спецификация создана и утверждена");
    } catch (err) {
      setBomError(err instanceof ApiError ? err.message : "Не удалось создать спецификацию");
    } finally {
      setBomSubmitting(false);
    }
  };

  // ---- Шаг 7: Производственный заказ ----
  const [totalQuantity, setTotalQuantity] = useState<number | undefined>(undefined);
  const [unitPrice, setUnitPrice] = useState<number | undefined>(undefined);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const submitOrderStep = async () => {
    setOrderError(null);
    if (!totalQuantity || totalQuantity <= 0) {
      setOrderError("Укажите общее количество единиц в партии");
      return;
    }
    if (unitPrice === undefined || unitPrice < 0) {
      setOrderError("Укажите цену за единицу");
      return;
    }
    setOrderSubmitting(true);
    try {
      const preview = await apiRequest<PreviewProductionOrderVariantsResponseDto>(
        "/production-orders/preview-variants",
        { method: "POST", body: { productId, colors: [{ color: orderColor, quantity: totalQuantity }] } },
      );
      const variantsPayload = preview.rows
        .filter((row) => row.quantity > 0)
        .map((row) => ({ productVariantId: row.productVariantId, quantity: row.quantity }));
      const plannedQuantity = variantsPayload.reduce((sum, row) => sum + row.quantity, 0);
      const order = await apiRequest<{ id: string }>("/production-orders", {
        method: "POST",
        body: {
          productId,
          bomId,
          workshopId,
          plannedQuantity,
          agreedUnitPrice: unitPrice,
          variants: variantsPayload,
        },
      });
      await apiRequest(`/production-orders/${order.id}/confirm`, { method: "POST" });
      setCreatedOrderId(order.id);
      setDone((prev) => ({ ...prev, order: true }));
      toast.success("Заказ создан и подтверждён", { description: "Snapshot партии зафиксирован" });
    } catch (err) {
      setOrderError(err instanceof ApiError ? err.message : "Не удалось создать или подтвердить заказ");
    } finally {
      setOrderSubmitting(false);
    }
  };

  if (isLoadingRefs) return <SkeletonList />;
  if (refsError) return <ErrorState title="Не удалось загрузить справочники" description={refsError} onRetry={loadRefs} />;

  const stepState = (step: StepKey): "done" | "current" | "pending" => {
    if (done[step]) return "done";
    if (isUnlocked(step)) return "current";
    return "pending";
  };

  return (
    <div className="mx-auto max-w-[820px]">
      <PageHeader
        title="Новая партия"
        subtitle="Один проход: цех → материал → модель → BOM → заказ"
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Новая партия" }]} />}
      />

      <div className="mt-5 flex flex-col gap-4">
        {/* Шаг 1 — Цех */}
        <Card>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={1} state={stepState("workshop")} />
            <CardTitle>{STEP_TITLES.workshop}</CardTitle>
            {done.workshop && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reopenFrom("workshop")}>
                Изменить
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {done.workshop ? (
              <p className="t-body">
                Выбран цех: <strong>{workshops.find((w) => w.id === workshopId)?.name ?? workshopId}</strong>
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <FilterTabs
                  options={[
                    { value: "create", label: "Создать новый" },
                    { value: "select", label: "Выбрать существующий" },
                  ]}
                  value={workshopMode}
                  onChange={setWorkshopMode}
                />
                {workshopMode === "select" ? (
                  <Field label="Цех">
                    <Combobox
                      options={workshops.map((w) => ({ value: w.id, label: w.name }))}
                      value={workshopId}
                      onChange={setWorkshopId}
                      placeholder="Выберите цех..."
                      emptyText="Цехов пока нет — создайте новый"
                    />
                  </Field>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Название" className="sm:col-span-2">
                      <Input value={newWorkshopName} onChange={(e) => setNewWorkshopName(e.target.value)} placeholder="Цех №1 — Пилот" />
                    </Field>
                    <Field label="Специализация">
                      <Input
                        value={newWorkshopSpecialization}
                        onChange={(e) => setNewWorkshopSpecialization(e.target.value)}
                        placeholder="Трикотаж"
                      />
                    </Field>
                    <Field label="Номер договора" hint={<span className="text-muted-foreground/70">нужен для подтверждения заказа</span>}>
                      <Input
                        value={newWorkshopContractNumber}
                        onChange={(e) => setNewWorkshopContractNumber(e.target.value)}
                        placeholder="Пилот-1"
                      />
                    </Field>
                  </div>
                )}
                {workshopError && <p className="text-[12px] font-medium text-danger">{workshopError}</p>}
                <Button onClick={() => void submitWorkshopStep()} loading={workshopSubmitting} size="sm" className="self-start">
                  Далее
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Шаг 2 — Материал */}
        <Card className={cn(!isUnlocked("material") && "opacity-50")}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={2} state={stepState("material")} />
            <CardTitle>{STEP_TITLES.material}</CardTitle>
            {done.material && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reopenFrom("material")}>
                Изменить
              </Button>
            )}
          </CardHeader>
          {isUnlocked("material") && (
            <CardContent>
              {done.material ? (
                <p className="t-body">
                  Выбран материал: <strong>{materials.find((m) => m.id === materialId)?.name ?? materialId}</strong>
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <FilterTabs
                    options={[
                      { value: "create", label: "Создать новый" },
                      { value: "select", label: "Выбрать существующий" },
                    ]}
                    value={materialMode}
                    onChange={setMaterialMode}
                  />
                  {materialMode === "select" ? (
                    <Field label="Материал">
                      <Combobox
                        options={materials.map((m) => ({ value: m.id, label: `${m.name} (${unitLabel(m.unit)})` }))}
                        value={materialId}
                        onChange={setMaterialId}
                        placeholder="Выберите материал..."
                        emptyText="Материалов пока нет — создайте новый"
                      />
                    </Field>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Название" className="sm:col-span-3">
                        <Input value={newMaterialName} onChange={(e) => setNewMaterialName(e.target.value)} placeholder="Двухнитка пилот" />
                      </Field>
                      <Field label="Тип">
                        <Select value={newMaterialType} onValueChange={(v) => setNewMaterialType(v as typeof newMaterialType)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MATERIAL_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Единица">
                        <Select value={newMaterialUnit} onValueChange={(v) => setNewMaterialUnit(v as typeof newMaterialUnit)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MATERIAL_UNITS.map((u) => (
                              <SelectItem key={u.value} value={u.value}>
                                {u.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Точка перезаказа">
                        <NumberInput value={newMaterialReorderPoint} onChange={setNewMaterialReorderPoint} suffix={unitLabel(newMaterialUnit)} />
                      </Field>
                    </div>
                  )}
                  {materialError && <p className="text-[12px] font-medium text-danger">{materialError}</p>}
                  <Button onClick={() => void submitMaterialStep()} loading={materialSubmitting} size="sm" className="self-start">
                    Далее
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Шаг 3 — Модель */}
        <Card className={cn(!isUnlocked("product") && "opacity-50")}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={3} state={stepState("product")} />
            <CardTitle>{STEP_TITLES.product}</CardTitle>
            {done.product && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reopenFrom("product")}>
                Изменить
              </Button>
            )}
          </CardHeader>
          {isUnlocked("product") && (
            <CardContent>
              {done.product ? (
                <p className="t-body">
                  Выбрана модель: <strong>{products.find((p) => p.id === productId)?.name ?? productId}</strong>
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <FilterTabs
                    options={[
                      { value: "create", label: "Создать новую" },
                      { value: "select", label: "Выбрать существующую" },
                    ]}
                    value={productMode}
                    onChange={setProductMode}
                  />
                  {productMode === "select" ? (
                    <Field label="Модель">
                      <Combobox
                        options={products.map((p) => ({ value: p.id, label: p.name }))}
                        value={productId}
                        onChange={setProductId}
                        placeholder="Выберите модель..."
                        emptyText="Моделей пока нет — создайте новую"
                      />
                    </Field>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Название">
                        <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Худи Пилот" />
                      </Field>
                      <Field label="Артикул">
                        <Input value={newProductCode} onChange={(e) => setNewProductCode(e.target.value)} placeholder="HUD-PILOT-01" />
                      </Field>
                    </div>
                  )}
                  {productError && <p className="text-[12px] font-medium text-danger">{productError}</p>}
                  <Button onClick={() => void submitProductStep()} loading={productSubmitting} size="sm" className="self-start">
                    Далее
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Шаг 4 — Размерный ряд */}
        <Card className={cn(!isUnlocked("sizes") && "opacity-50")}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={4} state={stepState("sizes")} />
            <CardTitle>{STEP_TITLES.sizes}</CardTitle>
            {done.sizes && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reopenFrom("sizes")}>
                Изменить
              </Button>
            )}
          </CardHeader>
          {isUnlocked("sizes") && (
            <CardContent>
              {!sizesLoaded ? (
                <SkeletonList />
              ) : done.sizes && !sizesEditing ? (
                <p className="t-body">
                  Размерный ряд: {existingSizes.map((s) => `${s.size} (${s.ratioWeight})`).join(" / ")}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    {sizeRows.map((row, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={row.size}
                          onChange={(e) => updateSizeRow(index, { size: e.target.value })}
                          placeholder="Размер, напр. S"
                          className="w-28"
                        />
                        <NumberInput
                          value={row.ratioWeight}
                          onChange={(value) => updateSizeRow(index, { ratioWeight: value })}
                          suffix="вес"
                          min={0}
                          className="w-32"
                        />
                        {sizeRows.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => removeSizeRow(index)}>
                            Убрать
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button variant="secondary" size="sm" onClick={addSizeRow} className="self-start">
                      + Добавить размер
                    </Button>
                  </div>
                  {sizesError && <p className="text-[12px] font-medium text-danger">{sizesError}</p>}
                  <Button onClick={() => void submitSizesStep()} loading={sizesSubmitting} size="sm" className="self-start">
                    Сохранить размерный ряд
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Шаг 5 — Цвет / вариант */}
        <Card className={cn(!isUnlocked("color") && "opacity-50")}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={5} state={stepState("color")} />
            <CardTitle>{STEP_TITLES.color}</CardTitle>
            {done.color && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reopenFrom("color")}>
                Изменить
              </Button>
            )}
          </CardHeader>
          {isUnlocked("color") && (
            <CardContent>
              {!variantsLoaded ? (
                <SkeletonList />
              ) : done.color ? (
                <p className="t-body">
                  Цвет для этой партии: <strong>{orderColor}</strong>
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <FilterTabs
                    options={[
                      { value: "create", label: "Добавить новый цвет" },
                      { value: "select", label: "Выбрать существующий" },
                    ]}
                    value={colorMode}
                    onChange={setColorMode}
                  />
                  {colorMode === "select" ? (
                    <Field label="Цвет">
                      <Select value={orderColor} onValueChange={setOrderColor}>
                        <SelectTrigger>
                          <SelectValue placeholder="Выберите цвет" />
                        </SelectTrigger>
                        <SelectContent>
                          {existingColors.map((color) => (
                            <SelectItem key={color} value={color}>
                              {color}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Название цвета">
                        <Input value={newColorName} onChange={(e) => setNewColorName(e.target.value)} placeholder="Чёрный" />
                      </Field>
                      <Field label="Код цвета">
                        <Input value={newColorCode} onChange={(e) => setNewColorCode(e.target.value)} placeholder="BLACK" />
                      </Field>
                    </div>
                  )}
                  {colorError && <p className="text-[12px] font-medium text-danger">{colorError}</p>}
                  <Button onClick={() => void submitColorStep()} loading={colorSubmitting} size="sm" className="self-start">
                    Далее
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Шаг 6 — BOM */}
        <Card className={cn(!isUnlocked("bom") && "opacity-50")}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={6} state={stepState("bom")} />
            <CardTitle>{STEP_TITLES.bom}</CardTitle>
            {done.bom && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => reopenFrom("bom")}>
                Изменить
              </Button>
            )}
          </CardHeader>
          {isUnlocked("bom") && (
            <CardContent>
              {!bomsLoaded ? (
                <SkeletonList />
              ) : done.bom ? (
                <p className="t-body">Спецификация утверждена, будет использована при создании заказа.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {existingBoms.some((row) => row.status === "approved") && (
                    <FilterTabs
                      options={[
                        { value: "use", label: "Использовать утверждённую" },
                        { value: "create", label: "Создать новую версию" },
                      ]}
                      value={bomMode}
                      onChange={setBomMode}
                    />
                  )}
                  {bomMode === "use" ? (
                    <p className="t-body text-muted-foreground">
                      Уже утверждённая спецификация найдена — используем её без изменений.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {bomRows.map((row, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <Combobox
                            options={materials.map((m) => ({ value: m.id, label: `${m.name} (${unitLabel(m.unit)})` }))}
                            value={row.materialId}
                            onChange={(value) => updateBomRow(index, { materialId: value })}
                            placeholder="Материал..."
                          />
                          <NumberInput
                            value={row.quantityPerUnit}
                            onChange={(value) => updateBomRow(index, { quantityPerUnit: value })}
                            suffix="на ед."
                            decimals={2}
                            min={0}
                            className="w-32"
                          />
                          <NumberInput
                            value={row.wastePercent}
                            onChange={(value) => updateBomRow(index, { wastePercent: value })}
                            suffix="% отходы"
                            decimals={1}
                            min={0}
                            className="w-32"
                          />
                          {bomRows.length > 1 && (
                            <Button variant="ghost" size="sm" onClick={() => removeBomRow(index)}>
                              Убрать
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="secondary" size="sm" onClick={addBomRow} className="self-start">
                        + Добавить материал в норму
                      </Button>
                    </div>
                  )}
                  {bomError && <p className="text-[12px] font-medium text-danger">{bomError}</p>}
                  <Button onClick={() => void submitBomStep()} loading={bomSubmitting} size="sm" className="self-start">
                    {bomMode === "use" ? "Далее" : "Создать и утвердить спецификацию"}
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* Шаг 7 — Производственный заказ */}
        <Card className={cn(!isUnlocked("order") && "opacity-50")}>
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <StepBadge index={7} state={stepState("order")} />
            <CardTitle>{STEP_TITLES.order}</CardTitle>
          </CardHeader>
          {isUnlocked("order") && (
            <CardContent>
              {done.order && createdOrderId ? (
                <div className="flex flex-col gap-3">
                  <p className="t-body">
                    Заказ создан и подтверждён — Snapshot партии зафиксирован (нормы расхода, цена, реквизиты цеха).
                  </p>
                  <Button onClick={() => void navigate(`/production-orders/${createdOrderId}`)} size="sm" className="self-start">
                    Открыть Паспорт партии
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="t-body text-muted-foreground">
                    Модель, цех, спецификация и цвет уже выбраны на предыдущих шагах — здесь только количество и цена.
                    Раскладка по размерам ({existingSizes.map((s) => s.size).join("/")}) рассчитается автоматически по
                    сохранённому размерному ряду.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Общее количество, шт.">
                      <NumberInput value={totalQuantity} onChange={setTotalQuantity} min={1} />
                    </Field>
                    <Field label="Цена за единицу">
                      <MoneyInput currency="₽" value={unitPrice} onChange={setUnitPrice} />
                    </Field>
                  </div>
                  {orderError && <p className="text-[12px] font-medium text-danger">{orderError}</p>}
                  <Button onClick={() => void submitOrderStep()} loading={orderSubmitting} size="sm" className="self-start">
                    Создать и подтвердить заказ
                  </Button>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
