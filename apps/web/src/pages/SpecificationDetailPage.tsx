import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  PresetResponseDto,
  ProductionOrderResponseDto,
  ProductResponseDto,
  ProductVariantResponseDto,
  SpecificationAvailableQuantityResponseDto,
  SpecificationResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle, SectionLabel } from "../design-system/Card/Card";
import { Field } from "../design-system/Form/Field";
import { Input } from "../design-system/Input/Input";
import { NumberInput } from "../design-system/Input/NumberInput";
import { Combobox } from "../design-system/Select/Combobox";
import { FilterTabs } from "../design-system/Tabs/FilterTabs";
import { Button } from "../design-system/Button/Button";
import { DatePicker } from "../design-system/Form/DatePicker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../design-system/Modal/Dialog";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { DataTable, Td } from "../design-system/Blocks";
import { toast } from "../design-system/Toast/Toast";
import { currencyLabel, formatDate, formatMoney, formatQuantity } from "../lib/format";
import { SIZE_PRESETS } from "../lib/size-presets";
import { openDocumentFile } from "../lib/open-document";
import { cn } from "../design-system/utils";

// Единый мастер спецификации (Этап 2 — «Паспорт модели», владелец проекта,
// 2026-09-12, требования №8-15): модель → цех → строки → условия → черновик
// → утверждение → PDF, всё на одном экране, без блуждания по разделам.
// Пока строк ещё нет, ничего не сохраняется на сервер — POST /specifications
// вызывается ровно один раз, при нажатии «Создать черновик» (у Этапа 1 нет
// эндпоинта правки черновика, поэтому промежуточных сохранений не будет).
export function SpecificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (id === "new") return <SpecificationWizard />;
  if (id) return <SpecificationView id={id} />;
  return null;
}

interface DraftItem {
  variant: ProductVariantResponseDto;
  quantity?: number;
  unitPrice?: number;
}

function SpecificationWizard() {
  const navigate = useNavigate();

  const [productMode, setProductMode] = useState<"select" | "create">("select");
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [productId, setProductId] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newProductCode, setNewProductCode] = useState("");
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);

  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);
  const [hasSizes, setHasSizes] = useState(true);
  const [quickSizes, setQuickSizes] = useState<Array<{ size: string; ratioWeight: number }>>([]);
  const [isSavingQuickSizes, setIsSavingQuickSizes] = useState(false);
  const [newColor, setNewColor] = useState("");
  const [newColorCode, setNewColorCode] = useState("");
  const [isAddingColor, setIsAddingColor] = useState(false);
  // Подсказки для «Цвет» — уже встречавшиеся у компании названия (владелец
  // проекта, 2026-09-21): «цвет один раз ввёл, дальше выбираешь из списка».
  const [colorPresets, setColorPresets] = useState<string[]>([]);

  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [workshopId, setWorkshopId] = useState("");
  const [newWorkshopName, setNewWorkshopName] = useState("");
  const [newWorkshopContractNumber, setNewWorkshopContractNumber] = useState("");
  const [isSubmittingWorkshop, setIsSubmittingWorkshop] = useState(false);

  const [items, setItems] = useState<Record<string, DraftItem>>({});
  const [deliveryDeadline, setDeliveryDeadline] = useState<Date | undefined>();
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  useEffect(() => {
    void apiRequest<ProductResponseDto[]>("/products").then(setProducts);
    void apiRequest<string[]>("/products/colors").then(setColorPresets).catch(() => setColorPresets([]));
    // Шаг «Цех» скрыт (владелец проекта, 2026-09-21 — «пока цех всего один,
    // не заставлять выбирать его каждый раз»): первый цех из списка
    // выбирается автоматически и молча, шаг остаётся скрытым, пока цехов
    // хотя бы один. Явный выбор цеха на конкретную партию переносится в
    // карточку заказа пошива.
    void apiRequest<WorkshopResponseDto[]>("/workshops").then((rows) => {
      setWorkshops(rows);
      if (rows.length > 0 && rows[0]) setWorkshopId(rows[0].id);
    });
  }, []);

  const loadVariantsAndSizes = (pid: string) => {
    void apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${pid}`).then((rows) => {
      setVariants(rows);
      setItems((prev) => {
        const next: Record<string, DraftItem> = {};
        for (const variant of rows) next[variant.id] = prev[variant.id] ?? { variant };
        return next;
      });
    });
    void apiRequest<Array<{ size: string; ratioWeight: number }>>(`/products/${pid}/sizes`).then((rows) => {
      setHasSizes(rows.length > 0);
      if (rows.length === 0) setQuickSizes([{ size: "", ratioWeight: 1 }]);
    });
  };

  useEffect(() => {
    if (productId) loadVariantsAndSizes(productId);
  }, [productId]);

  const selectProduct = (pid: string) => {
    setProductId(pid);
  };

  const createProduct = async () => {
    if (!newProductName.trim() || !newProductCode.trim()) return;
    setIsSubmittingProduct(true);
    try {
      const created = await apiRequest<ProductResponseDto>("/products", {
        method: "POST",
        body: { name: newProductName.trim(), code: newProductCode.trim() },
      });
      setProducts((prev) => [...prev, created]);
      setProductId(created.id);
      setProductMode("select");
      toast.success("Модель создана — настройте размеры и цвета ниже");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать модель");
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const saveQuickSizes = async () => {
    if (!productId) return;
    const sizes = quickSizes.filter((row) => row.size.trim().length > 0);
    if (sizes.length === 0) return;
    setIsSavingQuickSizes(true);
    try {
      await apiRequest(`/products/${productId}/sizes`, { method: "PUT", body: { sizes } });
      setHasSizes(true);
      toast.success("Размерный ряд сохранён");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить размерный ряд");
    } finally {
      setIsSavingQuickSizes(false);
    }
  };

  const addColor = async () => {
    if (!productId || !newColor.trim() || !newColorCode.trim()) return;
    setIsAddingColor(true);
    try {
      const addedColor = newColor.trim();
      await apiRequest(`/products/${productId}/colors`, {
        method: "POST",
        body: { color: addedColor, colorCode: newColorCode.trim() },
      });
      setColorPresets((prev) => (prev.includes(addedColor) ? prev : [...prev, addedColor].sort()));
      setNewColor("");
      setNewColorCode("");
      loadVariantsAndSizes(productId);
      toast.success("Цвет добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось добавить цвет");
    } finally {
      setIsAddingColor(false);
    }
  };

  const createWorkshop = async () => {
    if (!newWorkshopName.trim()) return;
    setIsSubmittingWorkshop(true);
    try {
      const created = await apiRequest<WorkshopResponseDto>("/workshops", {
        method: "POST",
        body: { name: newWorkshopName.trim(), contractNumber: newWorkshopContractNumber.trim() || undefined },
      });
      setWorkshops((prev) => [...prev, created]);
      setWorkshopId(created.id);
      toast.success("Цех создан");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать цех");
    } finally {
      setIsSubmittingWorkshop(false);
    }
  };

  const activeItems = Object.values(items).filter((row) => (row.quantity ?? 0) > 0);
  const canCreateDraft = productId && workshopId && activeItems.length > 0;

  const createDraft = async () => {
    if (!canCreateDraft) return;
    setIsCreatingDraft(true);
    try {
      const created = await apiRequest<SpecificationResponseDto>("/specifications", {
        method: "POST",
        body: {
          productId,
          workshopId,
          deliveryDeadline: deliveryDeadline ? deliveryDeadline.toISOString().slice(0, 10) : undefined,
          items: activeItems.map((row) => ({
            productVariantId: row.variant.id,
            quantity: row.quantity,
            unitPrice: row.unitPrice ?? 0,
          })),
        },
      });
      toast.success("Черновик спецификации создан", { description: "Номер появится после утверждения." });
      void navigate(`/specifications/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать спецификацию");
    } finally {
      setIsCreatingDraft(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="Новая спецификация"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Спецификации", onClick: () => void navigate("/specifications") },
              { label: "Новая" },
            ]}
          />
        }
      />

      {/* Шаг 1 — Модель */}
      <Card>
        <CardHeader>
          <CardTitle>1. Модель</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <FilterTabs
            options={[
              { value: "select", label: "Выбрать существующую" },
              { value: "create", label: "+ Создать модель" },
            ]}
            value={productMode}
            onChange={setProductMode}
          />
          {productMode === "select" ? (
            <Field label="Модель">
              <Combobox
                // Артикул больше не показывается пользователю (владелец
                // проекта, 2026-09-21) — он автогенерируемый и ничего не
                // значит; в списке моделей достаточно названия.
                options={products.map((p) => ({ value: p.id, label: p.name }))}
                value={productId}
                onChange={selectProduct}
                placeholder="Выберите модель..."
                emptyText="Моделей пока нет — создайте новую"
              />
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название">
                <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Стеганка Гашов" />
              </Field>
              <Field label="Артикул">
                <Input value={newProductCode} onChange={(e) => setNewProductCode(e.target.value)} placeholder="STEGANKA-001" />
              </Field>
              <Button
                type="button"
                size="sm"
                className="sm:col-span-2 sm:self-start"
                loading={isSubmittingProduct}
                disabled={!newProductName.trim() || !newProductCode.trim()}
                onClick={() => void createProduct()}
              >
                Создать модель
              </Button>
            </div>
          )}

          {productId && !hasSizes && (
            <div className="rounded-[10px] border border-border bg-muted/40 p-3.5">
              <SectionLabel>Размерный ряд ещё не задан — задайте его сейчас</SectionLabel>
              <p className="t-secondary mt-1">
                «Доля» — это пропорция размера в будущих заказах (например, 1 / 2 / 1), а не количество для этой
                спецификации. Само количество по размерам и цветам вы укажете чуть ниже, в строках спецификации; если
                распределение по размерам не важно, оставьте у каждого размера значение 1.
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {quickSizes.map((row, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-2">
                    <Field label="Размер" className="min-w-[100px] flex-1">
                      <Combobox
                        options={SIZE_PRESETS.filter(
                          (size) => size === row.size || !quickSizes.some((r) => r.size === size),
                        ).map((size) => ({ value: size, label: size }))}
                        value={row.size}
                        onChange={(size) => setQuickSizes((prev) => prev.map((r, i) => (i === index ? { ...r, size } : r)))}
                        placeholder="Выберите размер..."
                      />
                    </Field>
                    <Field label="Доля" className="min-w-[90px] flex-1">
                      <NumberInput
                        value={row.ratioWeight}
                        onChange={(v) => setQuickSizes((prev) => prev.map((r, i) => (i === index ? { ...r, ratioWeight: v ?? 0 } : r)))}
                        min={0}
                        decimals={2}
                      />
                    </Field>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setQuickSizes((prev) => prev.filter((_, i) => i !== index))}>
                      Убрать
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setQuickSizes((prev) => [...prev, { size: "", ratioWeight: 1 }])}>
                    + Размер
                  </Button>
                  <Button type="button" size="sm" loading={isSavingQuickSizes} onClick={() => void saveQuickSizes()}>
                    Сохранить размерный ряд
                  </Button>
                </div>
              </div>
            </div>
          )}

          {productId && hasSizes && (
            <div className="rounded-[10px] border border-border bg-muted/40 p-3.5">
              <SectionLabel>Цвета модели ({new Set(variants.map((v) => v.color)).size})</SectionLabel>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <Field label="Цвет" className="min-w-[130px] flex-1">
                  <Combobox
                    options={colorPresets.map((color) => ({ value: color, label: color }))}
                    value={newColor}
                    onChange={setNewColor}
                    placeholder="Впишите или выберите цвет..."
                    allowCustomValue
                  />
                </Field>
                <Field label="Код цвета" className="min-w-[130px] flex-1">
                  <Input value={newColorCode} onChange={(e) => setNewColorCode(e.target.value)} placeholder="GRAFIT" />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  loading={isAddingColor}
                  disabled={!newColor.trim() || !newColorCode.trim()}
                  onClick={() => void addColor()}
                >
                  + Добавить цвет
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Шаг «Цех» скрыт, пока есть хотя бы один цех (см. useEffect выше) —
          выбор цеха на конкретную партию живёт в карточке заказа пошива, не
          здесь. Единственный случай, когда шаг всё же нужен — совсем новая
          компания без единого цеха: тогда скрывать нечего, выбирать не из
          чего. */}
      {workshops.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Цех</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Название">
                <Input value={newWorkshopName} onChange={(e) => setNewWorkshopName(e.target.value)} placeholder="Ак-Сарай Текстиль" />
              </Field>
              <Field label="Номер договора" hint={<span className="text-muted-foreground/70">можно указать позже, в карточке цеха</span>}>
                <Input value={newWorkshopContractNumber} onChange={(e) => setNewWorkshopContractNumber(e.target.value)} placeholder="П-22-04" />
              </Field>
              <Button
                type="button"
                size="sm"
                className="sm:col-span-2 sm:self-start"
                loading={isSubmittingWorkshop}
                disabled={!newWorkshopName.trim()}
                onClick={() => void createWorkshop()}
              >
                Создать цех
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Шаг 3 — Строки: модель → цвет → размер → количество → цена. Строки
          собираются из уже существующих product_variants — пользователь не
          печатает название товара вручную. */}
      {productId && hasSizes && (
        <Card>
          <CardHeader>
            <CardTitle>3. Строки спецификации</CardTitle>
          </CardHeader>
          <CardContent>
            {variants.length === 0 ? (
              <EmptyState compact title="У модели ещё нет ни одного варианта" description="Добавьте цвет в шаге 1 — размеры на него уже разложатся автоматически." />
            ) : (
              <div className="flex flex-col gap-2">
                {variants.map((variant) => {
                  const row = items[variant.id];
                  return (
                    <div key={variant.id} className="flex flex-wrap items-end gap-2 rounded-[10px] border border-border bg-muted/30 p-2.5">
                      <span className="min-w-[160px] flex-1 text-[13px] font-medium">
                        {variant.color} / {variant.size}
                      </span>
                      <Field label="Количество" className="min-w-[110px]">
                        <NumberInput
                          value={row?.quantity}
                          onChange={(v) => setItems((prev) => ({ ...prev, [variant.id]: { ...prev[variant.id], variant, quantity: v } }))}
                          min={0}
                        />
                      </Field>
                      <Field label="Цена, ₽" className="min-w-[110px]">
                        <NumberInput
                          value={row?.unitPrice}
                          onChange={(v) => setItems((prev) => ({ ...prev, [variant.id]: { ...prev[variant.id], variant, unitPrice: v } }))}
                          min={0}
                          decimals={2}
                        />
                      </Field>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Шаг 4 — Условия и создание черновика */}
      {canCreateDraft && (
        <Card>
          <CardHeader>
            <CardTitle>4. Срок поставки и создание</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field label="Период поставки" className="max-w-[260px]">
              <DatePicker value={deliveryDeadline} onChange={setDeliveryDeadline} />
            </Field>
            <p className="t-secondary">
              Количество: <strong className="num">{formatQuantity(activeItems.reduce((s, r) => s + (r.quantity ?? 0), 0))}</strong> шт. Итоговая
              сумма и предоплата 70% будут рассчитаны сервером и появятся сразу после создания черновика.
            </p>
            <Button type="button" loading={isCreatingDraft} className="self-start" onClick={() => void createDraft()}>
              Создать черновик
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SpecificationView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [spec, setSpec] = useState<SpecificationResponseDto | null>(null);
  const [product, setProduct] = useState<ProductResponseDto | null>(null);
  const [workshop, setWorkshop] = useState<WorkshopResponseDto | null>(null);
  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);
  const [error, setError] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [documents, setDocuments] = useState<Array<{ id: string; isCurrentVersion: boolean; title: string | null }>>([]);
  const [showBasedOn, setShowBasedOn] = useState(false);
  // Остаток спецификации по строкам (Этап 3 «Production Master», владелец
  // проекта, 2026-09-12) — сколько ещё не размещено ни в одной
  // производственной партии; нужен для кнопки «Создать производственную
  // партию». null, пока не утверждена или ещё не загружен.
  const [availableQuantity, setAvailableQuantity] = useState<SpecificationAvailableQuantityResponseDto | null>(null);
  const [showCreateBatch, setShowCreateBatch] = useState(false);

  // Редактирование спецификации NEW-потока (ПРОМПТ №3, раздел 2) —
  // спецификация, созданная ИЗ заказа (spec.productionOrderId задан):
  // редактируемый документ без approve/freeze, правка НЕ меняет заказ
  // (гарантия на уровне backend — UpdateSpecificationDeps физически не
  // содержит доступа к production_orders).
  const [isEditing, setIsEditing] = useState(false);
  const [editWorkshopId, setEditWorkshopId] = useState("");
  const [editDeliveryDeadline, setEditDeliveryDeadline] = useState<Date | undefined>();
  const [editItems, setEditItems] = useState<Record<string, { quantity: number; unitPrice: number }>>({});
  const [allWorkshops, setAllWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // Отмена спецификации NEW-потока (backend: POST /specifications/:id/cancel,
  // терминальное состояние) — до этой правки была вызываема только напрямую
  // через API, без кнопки в интерфейсе (owner, 2026-09-21, аудит пользовательского
  // пути).
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  // Пресеты цены спецификации (ПРОМПТ №3, раздел 5) — 700 RUB по умолчанию,
  // применяется сразу ко всем строкам вместо ручного ввода в каждую.
  const [pricePresets, setPricePresets] = useState<PresetResponseDto[]>([]);
  const [customPricePreset, setCustomPricePreset] = useState<number | undefined>(undefined);
  const [isSavingPricePreset, setIsSavingPricePreset] = useState(false);

  useEffect(() => {
    apiRequest<PresetResponseDto[]>("/presets?kind=specification_price")
      .then(setPricePresets)
      .catch(() => setPricePresets([]));
  }, []);

  const applyPriceToAllRows = (value: number) => {
    setEditItems((prev) =>
      Object.fromEntries(Object.entries(prev).map(([variantId, values]) => [variantId, { ...values, unitPrice: value }])),
    );
  };

  const addPricePreset = async () => {
    if (!customPricePreset) return;
    setIsSavingPricePreset(true);
    try {
      const preset = await apiRequest<PresetResponseDto>("/presets", {
        method: "POST",
        body: { kind: "specification_price", value: customPricePreset, currency: "RUB" },
      });
      setPricePresets((prev) => (prev.some((p) => p.id === preset.id) ? prev : [...prev, preset]));
      applyPriceToAllRows(Number(preset.value));
      setCustomPricePreset(undefined);
      toast.success("Значение сохранено — доступно при следующем выборе");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить значение");
    } finally {
      setIsSavingPricePreset(false);
    }
  };

  const load = () => {
    setError(false);
    apiRequest<SpecificationResponseDto>(`/specifications/${id}`)
      .then(async (loaded) => {
        setSpec(loaded);
        const [productData, workshopData, variantsData, docsData, workshopsData] = await Promise.all([
          apiRequest<ProductResponseDto>(`/products/${loaded.productId}`),
          apiRequest<WorkshopResponseDto>(`/workshops/${loaded.workshopId}`),
          apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${loaded.productId}`),
          apiRequest<Array<{ id: string; isCurrentVersion: boolean; title: string | null }>>(
            `/documents?entityType=specification&entityId=${loaded.id}`,
          ),
          apiRequest<WorkshopResponseDto[]>("/workshops"),
        ]);
        setProduct(productData);
        setWorkshop(workshopData);
        setVariants(variantsData);
        setDocuments(docsData);
        setAllWorkshops(workshopsData);
        if (loaded.status === "approved") {
          const available = await apiRequest<SpecificationAvailableQuantityResponseDto>(
            `/specifications/${loaded.id}/available-quantity`,
          );
          setAvailableQuantity(available);
        } else {
          setAvailableQuantity(null);
        }
      })
      .catch(() => setError(true));
  };
  useEffect(load, [id]);

  const approve = async () => {
    setIsApproving(true);
    try {
      await apiRequest(`/specifications/${id}/approve`, { method: "POST" });
      load();
      toast.success("Спецификация утверждена", { description: "Номер присвоен, данные зафиксированы навсегда." });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось утвердить спецификацию");
    } finally {
      setIsApproving(false);
    }
  };

  const generatePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await apiRequest(`/specifications/${id}/document`, { method: "POST" });
      load();
      toast.success("PDF сформирован");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сформировать PDF");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const cancelSpecification = async () => {
    if (!spec) return;
    setIsCancelling(true);
    try {
      await apiRequest(`/specifications/${spec.id}/cancel`, { method: "POST" });
      setShowCancelConfirm(false);
      load();
      toast.success("Спецификация отменена");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось отменить спецификацию");
    } finally {
      setIsCancelling(false);
    }
  };

  const startEdit = () => {
    if (!spec) return;
    setEditWorkshopId(spec.workshopId);
    setEditDeliveryDeadline(spec.deliveryDeadline ? new Date(spec.deliveryDeadline) : undefined);
    setEditItems(
      Object.fromEntries(
        spec.items.map((item) => [item.productVariantId, { quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) }]),
      ),
    );
    setIsEditing(true);
  };

  const saveEdit = async () => {
    if (!spec) return;
    setIsSavingEdit(true);
    try {
      await apiRequest(`/specifications/${spec.id}`, {
        method: "PATCH",
        body: {
          workshopId: editWorkshopId !== spec.workshopId ? editWorkshopId : undefined,
          deliveryDeadline: editDeliveryDeadline ? editDeliveryDeadline.toISOString().slice(0, 10) : null,
          items: Object.entries(editItems).map(([productVariantId, values]) => ({
            productVariantId,
            quantity: values.quantity,
            unitPrice: values.unitPrice,
          })),
        },
      });
      setIsEditing(false);
      load();
      toast.success("Спецификация изменена", { description: "Суммы пересчитаны. Заказ пошива не изменён." });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить изменения");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const downloadDocument = async (docId: string, title: string | null) => {
    await openDocumentFile(docId, title ?? "документ");
  };

  if (error) return <ErrorState title="Не удалось загрузить спецификацию" onRetry={load} />;
  if (!spec || !product || !workshop) return <SkeletonList />;

  const variantLabel = (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    return variant ? `${variant.color} / ${variant.size}` : variantId;
  };

  const currentDoc = documents.find((d) => d.isCurrentVersion);
  const remainder = spec.prepaymentAmount ? Number(spec.totalSum) - Number(spec.prepaymentAmount) : null;
  const hasAvailableQuantity = (availableQuantity?.items ?? []).some((row) => row.availableQuantity > 0.0005);
  const isFullyAllocated = spec.status === "approved" && availableQuantity !== null && !hasAvailableQuantity;
  // NEW-поток (ПРОМПТ №3) — спецификация создана ИЗ заказа: партия уже
  // существует, "Создать партию"/"Создать на основе" здесь не имеют смысла
  // (это операции LEGACY-потока, где спецификация первична).
  const isNewFlow = spec.productionOrderId !== null;
  const canEdit = isNewFlow && spec.status !== "cancelled";

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title={spec.specNumber ? `Спецификация №${spec.specNumber}` : "Спецификация (черновик)"}
        subtitle={
          <span className="flex items-center gap-2">
            <span>
              {product.name} · {workshop.name}
            </span>
            <StatusBadge status={spec.status} />
          </span>
        }
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Спецификации", onClick: () => void navigate("/specifications") },
              { label: spec.specNumber ? `№${spec.specNumber}` : "Черновик" },
            ]}
          />
        }
        actions={
          isEditing ? (
            <span className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setIsEditing(false)}>
                Отмена
              </Button>
              <Button size="sm" loading={isSavingEdit} onClick={() => void saveEdit()}>
                Сохранить
              </Button>
            </span>
          ) : canEdit ? (
            <span className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={startEdit}>
                Изменить
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCancelConfirm(true)}>
                Отменить
              </Button>
            </span>
          ) : spec.status === "draft" ? (
            // LEGACY-черновик — единственный статус, где отмена этой
            // спецификации вообще допустима backend'ом (assertIsDraft в
            // cancelSpecification); без этой кнопки ошибочный черновик было
            // невозможно ничем закрыть — только бросить (аудит
            // пользовательского пути, owner, 2026-09-21).
            <span className="flex flex-wrap items-center gap-2">
              <Button size="sm" loading={isApproving} onClick={() => void approve()}>
                Утвердить спецификацию
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCancelConfirm(true)}>
                Отменить
              </Button>
            </span>
          ) : spec.status === "approved" && !isNewFlow ? (
            <span className="flex flex-wrap items-center gap-2">
              {hasAvailableQuantity && (
                <Button size="sm" onClick={() => setShowCreateBatch(true)}>
                  Создать производственную партию
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => setShowBasedOn(true)}>
                Создать на основе
              </Button>
            </span>
          ) : undefined
        }
      />

      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>Цех и срок поставки</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Field label="Цех" className="min-w-[220px] flex-1">
              <Combobox
                value={editWorkshopId}
                onChange={setEditWorkshopId}
                placeholder="Выберите цех"
                searchPlaceholder="Поиск цеха..."
                options={allWorkshops.map((w) => ({ value: w.id, label: w.name }))}
              />
            </Field>
            <Field label="Срок поставки" className="min-w-[180px]">
              <DatePicker value={editDeliveryDeadline} onChange={setEditDeliveryDeadline} />
            </Field>
            <Field label="Цена спецификации — применить ко всем строкам" className="w-full">
              <div className="flex flex-wrap items-center gap-2">
                {pricePresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPriceToAllRows(Number(preset.value))}
                    className={cn(
                      "rounded-[10px] border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/30",
                    )}
                  >
                    {formatQuantity(Number(preset.value))} {preset.currency === "RUB" ? "руб." : preset.currency}
                  </button>
                ))}
                <NumberInput className="w-[120px]" value={customPricePreset} onChange={setCustomPricePreset} min={0} />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={isSavingPricePreset}
                  disabled={!customPricePreset}
                  onClick={() => void addPricePreset()}
                >
                  Сохранить и применить
                </Button>
              </div>
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Строки</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="min-w-0 overflow-x-auto">
            <DataTable
              columns={[
                { key: "variant", label: "Модель / цвет / размер" },
                { key: "quantity", label: "Количество", align: "right", width: "140px" },
                { key: "unitPrice", label: "Цена", align: "right", width: "140px" },
                { key: "sum", label: "Сумма", align: "right", width: "160px" },
              ]}
            >
              {spec.items.map((item) =>
                isEditing ? (
                  <tr key={item.id} className="cursor-default">
                    <Td>
                      {product.name}, {variantLabel(item.productVariantId)}
                    </Td>
                    <Td align="right">
                      <NumberInput
                        className="ml-auto w-[100px]"
                        value={editItems[item.productVariantId]?.quantity}
                        onChange={(value) =>
                          setEditItems((prev) => ({
                            ...prev,
                            [item.productVariantId]: { ...prev[item.productVariantId], quantity: value ?? 0, unitPrice: prev[item.productVariantId]?.unitPrice ?? 0 },
                          }))
                        }
                        min={0}
                      />
                    </Td>
                    <Td align="right">
                      <NumberInput
                        className="ml-auto w-[110px]"
                        value={editItems[item.productVariantId]?.unitPrice}
                        onChange={(value) =>
                          setEditItems((prev) => ({
                            ...prev,
                            [item.productVariantId]: { ...prev[item.productVariantId], unitPrice: value ?? 0, quantity: prev[item.productVariantId]?.quantity ?? 0 },
                          }))
                        }
                        min={0}
                      />
                    </Td>
                    <Td align="right" className="num text-muted-foreground">
                      {formatMoney(
                        (editItems[item.productVariantId]?.quantity ?? 0) * (editItems[item.productVariantId]?.unitPrice ?? 0),
                        currencyLabel(spec.totalSumCurrency),
                      )}
                    </Td>
                  </tr>
                ) : (
                  <tr key={item.id} className="cursor-default">
                    <Td>
                      {product.name}, {variantLabel(item.productVariantId)}
                    </Td>
                    <Td align="right" className="num">
                      {formatQuantity(Number(item.quantity))}
                    </Td>
                    <Td align="right" className="num">
                      {formatMoney(Number(item.unitPrice), currencyLabel(spec.totalSumCurrency))}
                    </Td>
                    <Td align="right" className="num">
                      {formatMoney(Number(item.sum), currencyLabel(spec.totalSumCurrency))}
                    </Td>
                  </tr>
                ),
              )}
            </DataTable>
          </div>
          {isEditing && (
            <p className="t-meta mt-2">
              Суммы пересчитаются после сохранения. Заказ пошива, из которого создана эта спецификация, не изменится.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Итоги</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <div className="t-meta">Количество</div>
            <div className="num text-[18px] font-semibold">{formatQuantity(Math.round(Number(spec.totalQuantity)))} шт.</div>
          </div>
          <div>
            <div className="t-meta">Общая сумма</div>
            <div className="num text-[18px] font-semibold">{formatMoney(Number(spec.totalSum), currencyLabel(spec.totalSumCurrency))}</div>
          </div>
          <div>
            <div className="t-meta">Предоплата 70%</div>
            <div className="num text-[18px] font-semibold">{spec.prepaymentAmount ? formatMoney(Number(spec.prepaymentAmount), currencyLabel(spec.totalSumCurrency)) : "—"}</div>
          </div>
          <div>
            <div className="t-meta">Остаток</div>
            <div className="num text-[18px] font-semibold">{remainder !== null ? formatMoney(remainder, currencyLabel(spec.totalSumCurrency)) : "—"}</div>
          </div>
          {spec.deliveryDeadline && (
            <div>
              <div className="t-meta">Срок поставки</div>
              <div className="text-[14px] font-medium">{formatDate(spec.deliveryDeadline)}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {spec.status === "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>Документ</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {currentDoc ? (
              <>
                <Button type="button" size="sm" onClick={() => void downloadDocument(currentDoc.id, currentDoc.title)}>
                  Скачать спецификацию
                </Button>
                <Button type="button" variant="secondary" size="sm" loading={isGeneratingPdf} onClick={() => void generatePdf()}>
                  Сформировать заново
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" loading={isGeneratingPdf} onClick={() => void generatePdf()}>
                Сформировать спецификацию
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isFullyAllocated && (
        <Card>
          <CardContent>
            <p className="t-secondary">
              Вся спецификация уже размещена производственными партиями — новую партию из неё создать нельзя.
            </p>
          </CardContent>
        </Card>
      )}

      {showCreateBatch && availableQuantity && (
        <CreateBatchPanel
          specificationId={spec.id}
          product={product}
          workshop={workshop}
          variants={variants}
          available={availableQuantity}
          onClose={() => setShowCreateBatch(false)}
          onCreated={(orderId) => void navigate(`/production-orders/${orderId}`)}
        />
      )}

      {showBasedOn && (
        <CreateFromExistingPanel
          source={spec}
          product={product}
          workshop={workshop}
          variants={variants}
          onClose={() => setShowBasedOn(false)}
          onCreated={(newId) => void navigate(`/specifications/${newId}`)}
        />
      )}

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отменить спецификацию?</DialogTitle>
            <DialogDescription>
              Спецификация перейдёт в статус «Отменена» — это действие необратимо. PDF по ней больше нельзя будет
              сформировать.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" size="sm" onClick={() => setShowCancelConfirm(false)}>
              Не отменять
            </Button>
            <Button variant="destructive" size="sm" loading={isCancelling} onClick={() => void cancelSpecification()}>
              Отменить спецификацию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// «Создать производственную партию» (Этап 3 «Production Master», владелец
// проекта, 2026-09-12) — по умолчанию берёт ВСЁ доступное количество по
// каждой строке (минимум кликов, принцип 17); количество можно уменьшить
// вручную для частичного запуска — backend сам не позволит превысить остаток.
// Партия создаётся сразу подтверждённой (status="placed"), отдельного шага
// подтверждения нет.
function CreateBatchPanel({
  specificationId,
  product,
  workshop,
  variants,
  available,
  onClose,
  onCreated,
}: {
  specificationId: string;
  product: ProductResponseDto;
  workshop: WorkshopResponseDto;
  variants: ProductVariantResponseDto[];
  available: SpecificationAvailableQuantityResponseDto;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}) {
  const eligible = available.items.filter((row) => row.availableQuantity > 0.0005);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(eligible.map((row) => [row.productVariantId, row.availableQuantity])),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantLabel = (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    return variant ? `${variant.color} / ${variant.size}` : variantId;
  };

  const totalQuantity = Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0);
  const canSubmit = eligible.every((row) => (quantities[row.productVariantId] ?? 0) <= row.availableQuantity + 0.0005) && totalQuantity > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      const items = eligible
        .map((row) => ({ productVariantId: row.productVariantId, quantity: quantities[row.productVariantId] ?? 0 }))
        .filter((row) => row.quantity > 0.0005);
      const order = await apiRequest<ProductionOrderResponseDto>(`/specifications/${specificationId}/production-order`, {
        method: "POST",
        body: { items },
      });
      toast.success(`Партия ${order.orderNumber ? `№${order.orderNumber}` : ""} создана`, {
        description: "Данные унаследованы из спецификации, статус — «Размещён».",
      });
      onCreated(order.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать производственную партию");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Создать производственную партию</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="t-secondary">
          Модель, цех и цены — {product.name} / {workshop.name}, как в спецификации. По умолчанию — всё доступное
          количество; уменьшите его, если хотите запустить партию частично.
        </p>
        <div className="flex flex-col gap-2">
          {eligible.map((row) => (
            <div key={row.productVariantId} className="flex flex-wrap items-end gap-2 rounded-[10px] border border-border bg-muted/30 p-2.5">
              <span className="min-w-[160px] flex-1 text-[13px] font-medium">{variantLabel(row.productVariantId)}</span>
              <span className="t-meta min-w-[100px]">Доступно: {formatQuantity(row.availableQuantity)}</span>
              <Field label="В партию" className="min-w-[110px]">
                <NumberInput
                  value={quantities[row.productVariantId]}
                  onChange={(v) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [row.productVariantId]: Math.min(v ?? 0, row.availableQuantity),
                    }))
                  }
                  min={0}
                  max={row.availableQuantity}
                />
              </Field>
            </div>
          ))}
        </div>
        <p className="t-secondary">
          Количество в партии: <strong className="num">{formatQuantity(totalQuantity)}</strong> шт.
        </p>
        <div className="flex gap-2">
          <Button type="button" loading={isSubmitting} disabled={!canSubmit} onClick={() => void submit()}>
            Создать партию
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// «Создать на основе» (требование №15) — отдельная операция
// Specification→Specification: источник остаётся утверждённым и неизменным,
// копия — новый черновик, где количество/цену/срок можно сразу поправить.
function CreateFromExistingPanel({
  source,
  product,
  workshop,
  variants,
  onClose,
  onCreated,
}: {
  source: SpecificationResponseDto;
  product: ProductResponseDto;
  workshop: WorkshopResponseDto;
  variants: ProductVariantResponseDto[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [rows, setRows] = useState(
    source.items.map((item) => ({ productVariantId: item.productVariantId, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) })),
  );
  const [deliveryDeadline, setDeliveryDeadline] = useState<Date | undefined>(
    source.deliveryDeadline ? new Date(source.deliveryDeadline) : undefined,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const variantLabel = (variantId: string) => {
    const variant = variants.find((v) => v.id === variantId);
    return variant ? `${variant.color} / ${variant.size}` : variantId;
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      const created = await apiRequest<SpecificationResponseDto>("/specifications/from-existing", {
        method: "POST",
        body: {
          sourceSpecificationId: source.id,
          overrideDeliveryDeadline: deliveryDeadline ? deliveryDeadline.toISOString().slice(0, 10) : undefined,
          overrideItems: rows,
        },
      });
      toast.success("Новый черновик создан на основе спецификации", {
        description: `Спецификация №${source.specNumber} осталась без изменений.`,
      });
      onCreated(created.id);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать спецификацию на основе существующей");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Создать на основе №{source.specNumber}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="t-secondary">
          Модель и цех — {product.name} / {workshop.name}, как в источнике. Поправьте количество и цену, если нужно —
          спецификация №{source.specNumber} не изменится.
        </p>
        <div className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={row.productVariantId} className="flex flex-wrap items-end gap-2 rounded-[10px] border border-border bg-muted/30 p-2.5">
              <span className="min-w-[160px] flex-1 text-[13px] font-medium">{variantLabel(row.productVariantId)}</span>
              <Field label="Количество" className="min-w-[110px]">
                <NumberInput
                  value={row.quantity}
                  onChange={(v) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, quantity: v ?? 0 } : r)))}
                  min={0}
                />
              </Field>
              <Field label="Цена, ₽" className="min-w-[110px]">
                <NumberInput
                  value={row.unitPrice}
                  onChange={(v) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, unitPrice: v ?? 0 } : r)))}
                  min={0}
                  decimals={2}
                />
              </Field>
            </div>
          ))}
        </div>
        <Field label="Период поставки" className="max-w-[260px]">
          <DatePicker value={deliveryDeadline} onChange={setDeliveryDeadline} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" loading={isSubmitting} onClick={() => void submit()}>
            Создать черновик
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
