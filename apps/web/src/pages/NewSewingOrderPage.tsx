import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type {
  ProductResponseDto,
  ProductSizeResponseDto,
  ProductVariantResponseDto,
  SewingOrderResponseDto,
  SewingOrderWithProductionOrdersResponseDto,
  WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Input } from "../design-system/Input/Input";
import { MoneyInput, NumberInput, PercentInput } from "../design-system/Input/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { Combobox } from "../design-system/Select/Combobox";
import { Button } from "../design-system/Button/Button";
import { FilterTabs } from "../design-system/Tabs/FilterTabs";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { isPercentSumValid, percentSum, distributeQuantityByPercentPreview } from "../lib/distribute-size-quantities";

// A02 «Новый заказ» (ADR 0002, «Штаб партии v1») — один заказ на пошив, одна
// или несколько моделей, общий цех, черновик автосохраняется на сервере.
// «Создать заказ» — атомарное размещение (POST /sewing-orders/:id/place):
// сервер сам пересчитывает итоги по каждой модели, эта форма только
// собирает намерение пользователя (T01: «итоги вычисляются и валидируются
// на сервере»).

interface ColorPlanState {
  key: string;
  color: string;
  quantity: number | undefined;
  percentages: Record<string, number | undefined>;
  cells: Record<string, number | undefined>;
}

interface ModelBlockState {
  key: string;
  productId: string;
  productName: string;
  distributionMode: "template" | "manual";
  agreedUnitPrice: number | undefined;
  variants: ProductVariantResponseDto[];
  variantsLoaded: boolean;
  colors: ColorPlanState[];
}

interface DraftPayloadModel {
  productId: string;
  productName: string;
  distributionMode: "template" | "manual";
  agreedUnitPrice: number | undefined;
  colors: Array<{
    color: string;
    quantity: number | undefined;
    percentages: Record<string, number | undefined>;
    cells: Record<string, number | undefined>;
  }>;
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function sizesForColor(model: ModelBlockState, color: string): string[] {
  return model.variants.filter((v) => v.color === color).map((v) => v.size);
}

function equalPercentages(sizes: string[]): Record<string, number | undefined> {
  if (sizes.length === 0) return {};
  const pairedSizes = ["48-50", "52-54", "56-58", "60-62", "64-66"];
  if (sizes.length === pairedSizes.length && pairedSizes.every((size) => sizes.includes(size))) {
    return { "48-50": 12.5, "52-54": 25, "56-58": 25, "60-62": 25, "64-66": 12.5 };
  }
  const base = Math.floor((100 / sizes.length) * 10) / 10;
  const result: Record<string, number | undefined> = {};
  let sum = 0;
  sizes.forEach((size, index) => {
    if (index === sizes.length - 1) {
      result[size] = Math.round((100 - sum) * 10) / 10;
    } else {
      result[size] = base;
      sum += base;
    }
  });
  return result;
}

function newColorPlan(sizes: string[]): ColorPlanState {
  return { key: uid(), color: "", quantity: undefined, percentages: equalPercentages(sizes), cells: {} };
}

export function NewSewingOrderPage() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  // The same placement request must survive a refresh after a lost response.
  // sessionStorage is scoped to this tab; separate tabs still get separate keys.
  const clientRequestIdRef = useRef<string | null>(null);
  if (routeId && clientRequestIdRef.current === null) {
    const key = `sewing-order-place:${routeId}`;
    const existing = sessionStorage.getItem(key);
    clientRequestIdRef.current = existing ?? crypto.randomUUID();
    if (!existing) sessionStorage.setItem(key, clientRequestIdRef.current);
  }

  const [sewingOrderId, setSewingOrderId] = useState<string | null>(routeId ?? null);
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshopId, setWorkshopId] = useState("");
  const [workshopMode, setWorkshopMode] = useState<"select" | "create">("select");
  const [newWorkshopName, setNewWorkshopName] = useState("");
  const [workshopBusy, setWorkshopBusy] = useState(false);

  const [models, setModels] = useState<ModelBlockState[]>([]);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  const initializedRef = useRef(false);
  const skipNextAutosaveRef = useRef(true);

  // Справочники — те же самые списки, что и на отдельных страницах
  // /workshops и /products, не параллельный источник данных.
  useEffect(() => {
    Promise.all([
      apiRequest<WorkshopResponseDto[]>("/workshops").then(setWorkshops),
      apiRequest<ProductResponseDto[]>("/products").then(setProducts),
    ]).catch((err: unknown) => toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить справочники"));
  }, []);

  // Без id в URL — создаём пустой черновик сразу и заменяем адрес, чтобы
  // перезагрузка страницы продолжала ТОТ ЖЕ черновик, а не создавала новый.
  // Guard обязателен: React.StrictMode (dev) монтирует эффект дважды подряд
  // (mount → cleanup → mount) — без него на каждое открытие «+ Заказ на
  // пошив» в dev-режиме тихо создавались два черновика вместо одного,
  // и редирект уводил на второй, оставляя первый осиротевшим в БД
  // (обнаружено проверкой двух вкладок, T01).
  const draftCreationStartedRef = useRef(false);
  useEffect(() => {
    if (routeId || draftCreationStartedRef.current) return;
    draftCreationStartedRef.current = true;
    apiRequest<SewingOrderResponseDto>("/sewing-orders", { method: "POST", body: {} })
      .then((draft) => void navigate(`/sewing-orders/${draft.id}/edit`, { replace: true }))
      .catch((err: unknown) => {
        draftCreationStartedRef.current = false;
        setLoadError(err instanceof ApiError ? err.message : "Не удалось создать черновик заказа");
      });
  }, [routeId, navigate]);

  // Есть id в URL — продолжаем существующий черновик (A02: «черновик →
  // перезагрузка → продолжение»).
  useEffect(() => {
    if (!routeId) return;
    setLoading(true);
    apiRequest<SewingOrderWithProductionOrdersResponseDto>(`/sewing-orders/${routeId}`)
      .then(async (data) => {
        if (data.status !== "draft") {
          // Уже размещён — форма его больше не редактирует, открываем штаб.
          sessionStorage.removeItem(`sewing-order-place:${routeId}`);
          void navigate(`/sewing-orders/${routeId}`, { replace: true });
          return;
        }
        setSewingOrderId(data.id);
        setVersion(data.version);
        setWorkshopId(data.workshopId ?? "");
        const payload = data.draftPayload as { models?: DraftPayloadModel[] } | null;
        const savedModels = payload?.models ?? [];
        const restored = await Promise.all(
          savedModels.map(async (saved) => {
            const variants = await apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${saved.productId}`).catch(
              () => [],
            );
            return {
              key: uid(),
              productId: saved.productId,
              productName: saved.productName,
              distributionMode: saved.distributionMode,
              agreedUnitPrice: saved.agreedUnitPrice,
              variants,
              variantsLoaded: true,
              colors: saved.colors.map((c) => ({
                key: uid(),
                color: c.color,
                quantity: c.quantity,
                percentages: c.percentages,
                cells: c.cells,
              })),
            } satisfies ModelBlockState;
          }),
        );
        setModels(restored);
        initializedRef.current = true;
      })
      .catch((err: unknown) => setLoadError(err instanceof ApiError ? err.message : "Не удалось загрузить заказ"))
      .finally(() => setLoading(false));
  }, [routeId, navigate]);

  const draftPayload = useMemo<{ models: DraftPayloadModel[] }>(
    () => ({
      models: models.map((m) => ({
        productId: m.productId,
        productName: m.productName,
        distributionMode: m.distributionMode,
        agreedUnitPrice: m.agreedUnitPrice,
        colors: m.colors.map((c) => ({ color: c.color, quantity: c.quantity, percentages: c.percentages, cells: c.cells })),
      })),
    }),
    [models],
  );

  // Автосохранение — debounce 800мс, только для уже загруженного черновика
  // (не на первый рендер до восстановления состояния). Первый проход этого
  // эффекта после завершения загрузки пропускается явно: переход
  // loading→false сам по себе меняет draftPayload/workshopId с "пустых"
  // значений на восстановленные из БД, что без этой защиты запускало бы
  // автосохранение немедленно после каждого открытия черновика без единого
  // реального действия пользователя (лишняя запись версии, обнаружено при
  // проверке двух вкладок).
  useEffect(() => {
    if (!sewingOrderId || loading || !initializedRef.current) return;
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    setSaveState("saving");
    const timer = setTimeout(() => {
      apiRequest<SewingOrderResponseDto>(`/sewing-orders/${sewingOrderId}`, {
        method: "PATCH",
        body: { version, workshopId: workshopId || null, draftPayload },
      })
        .then((updated) => {
          setVersion(updated.version);
          setSaveState("saved");
          setSaveErrorMessage(null);
        })
        .catch((err: unknown) => {
          setSaveState("error");
          if (err instanceof ApiError && err.code === "SEWING_ORDER_VERSION_CONFLICT") {
            setSaveErrorMessage("Черновик изменён в другой вкладке или на другом устройстве — обновите страницу");
          } else {
            setSaveErrorMessage(err instanceof ApiError ? err.message : "Не удалось сохранить черновик");
          }
        });
    }, 800);
    return () => clearTimeout(timer);
    // version намеренно не в зависимостях: иначе каждое успешное сохранение
    // перезапускало бы таймер автосохранения ещё раз.
  }, [sewingOrderId, workshopId, draftPayload, loading]);

  useEffect(() => {
    if (!initializedRef.current && !loading && routeId) initializedRef.current = true;
  }, [loading, routeId]);

  const submitWorkshop = async () => {
    if (workshopMode === "select") return;
    if (!newWorkshopName.trim()) {
      toast.error("Укажите название цеха");
      return;
    }
    setWorkshopBusy(true);
    try {
      const created = await apiRequest<WorkshopResponseDto>("/workshops", { method: "POST", body: { name: newWorkshopName.trim() } });
      setWorkshops((prev) => [...prev, created]);
      setWorkshopId(created.id);
      setWorkshopMode("select");
      toast.success(`Цех «${created.name}» создан`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать цех");
    } finally {
      setWorkshopBusy(false);
    }
  };

  const addModelBlock = () => {
    setModels((prev) => [
      ...prev,
      { key: uid(), productId: "", productName: "", distributionMode: "template", agreedUnitPrice: undefined, variants: [], variantsLoaded: true, colors: [] },
    ]);
  };
  const removeModelBlock = (key: string) => setModels((prev) => prev.filter((m) => m.key !== key));

  const patchModel = (key: string, patch: Partial<ModelBlockState>) => {
    setModels((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  };

  const selectExistingProduct = async (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    patchModel(key, { productId, productName: product?.name ?? "", variantsLoaded: false });
    try {
      const variants = await apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`);
      patchModel(key, { variants, variantsLoaded: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить варианты модели");
      patchModel(key, { variantsLoaded: true });
    }
  };

  const createProductForModel = async (key: string, name: string, code: string) => {
    if (!name.trim() || !code.trim()) {
      toast.error("Укажите название и артикул модели");
      return;
    }
    try {
      const created = await apiRequest<ProductResponseDto>("/products", { method: "POST", body: { name: name.trim(), code: code.trim() } });
      setProducts((prev) => [...prev, created]);
      patchModel(key, { productId: created.id, productName: created.name, variants: [], variantsLoaded: true });
      toast.success(`Модель «${created.name}» создана — теперь добавьте размеры и цвета`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать модель");
    }
  };

  const addColor = (modelKey: string) => {
    setModels((prev) =>
      prev.map((m) => {
        if (m.key !== modelKey) return m;
        const availableColors = [...new Set(m.variants.map((v) => v.color))];
        const nextColor = availableColors.find((c) => !m.colors.some((row) => row.color === c)) ?? "";
        const sizes = nextColor ? sizesForColor(m, nextColor) : [...new Set(m.variants.map((v) => v.size))];
        return { ...m, colors: [...m.colors, { ...newColorPlan(sizes), color: nextColor }] };
      }),
    );
  };
  const removeColor = (modelKey: string, colorKey: string) => {
    setModels((prev) => prev.map((m) => (m.key === modelKey ? { ...m, colors: m.colors.filter((c) => c.key !== colorKey) } : m)));
  };
  const patchColor = (modelKey: string, colorKey: string, patch: Partial<ColorPlanState>) => {
    setModels((prev) =>
      prev.map((m) =>
        m.key === modelKey ? { ...m, colors: m.colors.map((c) => (c.key === colorKey ? { ...c, ...patch } : c)) } : m,
      ),
    );
  };

  const validate = (): string | null => {
    if (!workshopId) return "Выберите цех";
    if (models.length === 0) return "Добавьте хотя бы одну модель";
    for (const model of models) {
      if (!model.productId) return "У каждой модели должен быть выбран артикул";
      if (model.agreedUnitPrice === undefined || model.agreedUnitPrice < 0) return `Укажите цену за единицу для модели «${model.productName}»`;
      if (model.colors.length === 0) return `Добавьте хотя бы один цвет для модели «${model.productName}»`;
      for (const color of model.colors) {
        if (!color.color) return `Выберите цвет в модели «${model.productName}»`;
        const sizes = sizesForColor(model, color.color);
        if (sizes.length === 0) return `У цвета «${color.color}» модели «${model.productName}» нет ни одного размера`;
        if (model.distributionMode === "template") {
          if (!color.quantity || color.quantity <= 0) return `Укажите количество для цвета «${color.color}»`;
          const percentages = sizes.map((size) => ({ size, percent: color.percentages[size] ?? 0 }));
          if (!isPercentSumValid(percentages)) {
            return `Доли размеров цвета «${color.color}» должны в сумме давать 100% (сейчас ${percentSum(percentages).toFixed(1)}%)`;
          }
        } else {
          const total = sizes.reduce((sum, size) => sum + (color.cells[size] ?? 0), 0);
          if (total <= 0) return `Укажите количество хотя бы в одной ячейке цвета «${color.color}»`;
        }
      }
    }
    return null;
  };

  const handlePlace = async () => {
    const error = validate();
    if (error) {
      setPlaceError(error);
      return;
    }
    setPlaceError(null);
    setPlacing(true);
    try {
      const body = {
        workshopId,
        clientRequestId: clientRequestIdRef.current ?? crypto.randomUUID(),
        models: models.map((model) => ({
          productId: model.productId,
          agreedUnitPrice: model.agreedUnitPrice ?? 0,
          distributionMode: model.distributionMode,
          colors: model.colors.map((color) => {
            const sizes = sizesForColor(model, color.color);
            if (model.distributionMode === "manual") {
              return { color: color.color, cells: sizes.map((size) => ({ size, quantity: color.cells[size] ?? 0 })) };
            }
            return {
              color: color.color,
              quantity: color.quantity ?? 0,
              percentages: sizes.map((size) => ({ size, percent: color.percentages[size] ?? 0 })),
            };
          }),
        })),
      };
      const result = await apiRequest<SewingOrderWithProductionOrdersResponseDto>(`/sewing-orders/${sewingOrderId}/place`, {
        method: "POST",
        body,
      });
      toast.success(`Заказ №${result.number ?? ""} создан`, { description: `Партий: ${result.productionOrders.length}` });
      sessionStorage.removeItem(`sewing-order-place:${result.id}`);
      void navigate(`/sewing-orders/${result.id}`);
    } catch (err) {
      // The server may have committed the transaction while the response was
      // lost. Resolve the authoritative status before offering another try.
      try {
        const current = await apiRequest<SewingOrderWithProductionOrdersResponseDto>(`/sewing-orders/${sewingOrderId}`);
        if (current.status !== "draft") {
          sessionStorage.removeItem(`sewing-order-place:${current.id}`);
          void navigate(`/sewing-orders/${current.id}`, { replace: true });
          return;
        }
      } catch {
        // Leave the same request key in sessionStorage for the next retry.
      }
      setPlaceError(err instanceof ApiError ? err.message : "Не удалось создать заказ");
    } finally {
      setPlacing(false);
    }
  };

  if (loadError) return <ErrorState title="Не удалось открыть заказ" description={loadError} onRetry={() => window.location.reload()} />;
  if (loading || !sewingOrderId) return <SkeletonList />;

  const saveLabel =
    saveState === "saving" ? "Сохраняем…" : saveState === "saved" ? "Сохранено" : saveState === "error" ? "Не сохранено — повторить" : "";

  return (
    <div className="mx-auto max-w-[880px]">
      <PageHeader
        title="Новый заказ на пошив"
        subtitle="Один цех, одна или несколько моделей — общий заказ"
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Заказы на пошив", onClick: () => void navigate("/sewing-orders") },
              { label: "Новый заказ" },
            ]}
          />
        }
      />

      <div className="mt-3 flex items-center gap-2 text-[12.5px]" data-testid="save-status">
        {saveState === "error" ? (
          <button
            type="button"
            className="font-medium text-danger underline"
            onClick={() => setSaveState((s) => (s === "error" ? "idle" : s))}
          >
            {saveLabel}
          </button>
        ) : (
          saveLabel && <span className="text-muted-foreground">{saveLabel}</span>
        )}
        {saveErrorMessage && <span className="text-danger">— {saveErrorMessage}</span>}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Цех</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <FilterTabs
              options={[
                { value: "select", label: "Выбрать существующий" },
                { value: "create", label: "+ Добавить цех" },
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
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Название цеха" className="min-w-[240px] flex-1">
                  <Input
                    value={newWorkshopName}
                    onChange={(e) => setNewWorkshopName(e.target.value)}
                    placeholder="Цех №1"
                    data-testid="new-workshop-name"
                  />
                </Field>
                <Button onClick={() => void submitWorkshop()} loading={workshopBusy} size="sm" data-testid="save-workshop">
                  Создать и выбрать
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {models.map((model, index) => (
        <ModelBlockCard
          key={model.key}
          index={index}
          model={model}
          products={products}
          onRemove={() => removeModelBlock(model.key)}
          onSelectProduct={(productId) => void selectExistingProduct(model.key, productId)}
          onCreateProduct={(name, code) => void createProductForModel(model.key, name, code)}
          onPatch={(patch) => patchModel(model.key, patch)}
          onVariantsChanged={(variants) => patchModel(model.key, { variants })}
          onAddColor={() => addColor(model.key)}
          onRemoveColor={(colorKey) => removeColor(model.key, colorKey)}
          onPatchColor={(colorKey, patch) => patchColor(model.key, colorKey, patch)}
        />
      ))}

      <Button variant="secondary" onClick={addModelBlock} className="mt-4" data-testid="add-model-block">
        + Добавить модель в заказ
      </Button>

      {placeError && (
        <p className="mt-4 text-[13px] font-medium text-danger" data-testid="place-error">
          {placeError}
        </p>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={() => void handlePlace()} loading={placing} disabled={saveState === "saving" || saveState === "error"} data-testid="place-order">
          Создать заказ
        </Button>
      </div>
    </div>
  );
}

function ModelBlockCard({
  index,
  model,
  products,
  onRemove,
  onSelectProduct,
  onCreateProduct,
  onPatch,
  onVariantsChanged,
  onAddColor,
  onRemoveColor,
  onPatchColor,
}: {
  index: number;
  model: ModelBlockState;
  products: ProductResponseDto[];
  onRemove: () => void;
  onSelectProduct: (productId: string) => void;
  onCreateProduct: (name: string, code: string) => void;
  onPatch: (patch: Partial<ModelBlockState>) => void;
  onVariantsChanged: (variants: ProductVariantResponseDto[]) => void;
  onAddColor: () => void;
  onRemoveColor: (colorKey: string) => void;
  onPatchColor: (colorKey: string, patch: Partial<ColorPlanState>) => void;
}) {
  const [productMode, setProductMode] = useState<"select" | "create">("select");
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const existingColors = [...new Set(model.variants.map((v) => v.color))];

  return (
    <Card className="mt-4" data-testid={`model-block-${index}`}>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <CardTitle>{model.productName || "Модель"}</CardTitle>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onRemove}>
          Убрать модель
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!model.productId ? (
          <div className="flex flex-col gap-3">
            <FilterTabs
              options={[
                { value: "select", label: "Выбрать существующую" },
                { value: "create", label: "+ Добавить модель" },
              ]}
              value={productMode}
              onChange={setProductMode}
            />
            {productMode === "select" ? (
              <Field label="Модель">
                <Combobox
                  options={products.map((p) => ({ value: p.id, label: p.name }))}
                  value={model.productId}
                  onChange={onSelectProduct}
                  placeholder="Выберите модель..."
                  emptyText="Моделей пока нет — создайте новую"
                />
              </Field>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Название">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Худи Base"
                    data-testid="new-model-name"
                  />
                </Field>
                <Field label="Артикул">
                  <Input
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="HOODIE-BASE"
                    data-testid="new-model-code"
                  />
                </Field>
                <Button
                  size="sm"
                  className="self-start sm:col-span-2"
                  data-testid="save-model"
                  onClick={() => onCreateProduct(newName, newCode)}
                >
                  Сохранить и выбрать
                </Button>
              </div>
            )}
          </div>
        ) : model.variants.length === 0 && model.variantsLoaded ? (
          <ModelSizesAndColorsSetup productId={model.productId} onDone={onVariantsChanged} />
        ) : !model.variantsLoaded ? (
          <SkeletonList />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Цена за единицу">
                <MoneyInput
                  currency="₽"
                  value={model.agreedUnitPrice}
                  onChange={(v) => onPatch({ agreedUnitPrice: v })}
                  data-testid="unit-price"
                />
              </Field>
              <Field label="Режим распределения">
                <FilterTabs
                  options={[
                    { value: "template", label: "По шаблону" },
                    { value: "manual", label: "Вручную" },
                  ]}
                  value={model.distributionMode}
                  onChange={(mode) => onPatch({ distributionMode: mode })}
                />
              </Field>
            </div>

            {model.colors.map((color, colorIndex) => (
              <ColorPlanRow
                key={color.key}
                index={colorIndex}
                model={model}
                color={color}
                existingColors={existingColors}
                onRemove={() => onRemoveColor(color.key)}
                onPatch={(patch) => onPatchColor(color.key, patch)}
              />
            ))}
            <Button variant="secondary" size="sm" onClick={onAddColor} className="self-start" data-testid="add-color">
              + Добавить цвет
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ModelSizesAndColorsSetup({
  productId,
  onDone,
}: {
  productId: string;
  onDone: (variants: ProductVariantResponseDto[]) => void;
}) {
  interface SizeRow {
    size: string;
    ratioWeight: number | undefined;
  }
  const [sizeRows, setSizeRows] = useState<SizeRow[]>(
    ["48-50", "52-54", "56-58", "60-62", "64-66"].map((size) => ({ size, ratioWeight: 1 })),
  );
  const [sizePresets, setSizePresets] = useState<string[]>([]);
  const [colorPresets, setColorPresets] = useState<string[]>([]);
  const [colorName, setColorName] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [sizesSaved, setSizesSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRequest<string[]>("/products/size-presets").then(setSizePresets).catch(() => {
      // The editable default sizes remain available during a temporary outage.
    });
    void apiRequest<string[]>("/products/colors").then(setColorPresets).catch(() => {
      // Creating a new color remains possible without presets.
    });
  }, []);

  const saveSizes = async () => {
    const rows = sizeRows.filter((r) => r.size.trim() && r.ratioWeight);
    if (rows.length === 0) {
      toast.error("Добавьте хотя бы один размер");
      return;
    }
    setBusy(true);
    try {
      await apiRequest<ProductSizeResponseDto[]>(`/products/${productId}/sizes`, {
        method: "PUT",
        body: { sizes: rows.map((r) => ({ size: r.size.trim(), ratioWeight: r.ratioWeight })) },
      });
      setSizesSaved(true);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить размерный ряд");
    } finally {
      setBusy(false);
    }
  };

  const saveColor = async () => {
    if (!colorName.trim() || !colorCode.trim()) {
      toast.error("Укажите название и код цвета");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/products/${productId}/colors`, { method: "POST", body: { color: colorName.trim(), colorCode: colorCode.trim() } });
      const variants = await apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${productId}`);
      onDone(variants);
      toast.success(`Цвет «${colorName.trim()}» добавлен`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось добавить цвет");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[10px] border border-dashed border-border p-4">
      <p className="t-body text-muted-foreground">У этой модели ещё нет размеров и цветов — заполните прямо здесь.</p>
      {!sizesSaved ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] font-medium">Размерный ряд</p>
          {sizeRows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={row.size}
                list="sewing-order-size-presets"
                onChange={(e) => setSizeRows((prev) => prev.map((r, i) => (i === index ? { ...r, size: e.target.value } : r)))}
                placeholder="Размер, напр. M"
                className="w-32"
                data-testid={`size-row-${index}`}
              />
              <NumberInput
                value={row.ratioWeight}
                onChange={(v) => setSizeRows((prev) => prev.map((r, i) => (i === index ? { ...r, ratioWeight: v } : r)))}
                suffix="вес"
                min={0}
                className="w-32"
              />
              {sizeRows.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setSizeRows((prev) => prev.filter((_, i) => i !== index))}>
                  Убрать
                </Button>
              )}
            </div>
          ))}
          <datalist id="sewing-order-size-presets">
            {sizePresets.map((size) => <option key={size} value={size} />)}
          </datalist>
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setSizeRows((prev) => [...prev, { size: "", ratioWeight: 1 }])}>
            + Добавить размер
          </Button>
          <Button size="sm" className="self-start" loading={busy} onClick={() => void saveSizes()}>
            Сохранить размерный ряд
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] font-medium">Цвет</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Название цвета">
              <Input value={colorName} onChange={(e) => setColorName(e.target.value)} list="sewing-order-color-presets" placeholder="Чёрный" data-testid="new-color-name" />
              <datalist id="sewing-order-color-presets">
                {colorPresets.map((color) => <option key={color} value={color} />)}
              </datalist>
            </Field>
            <Field label="Код цвета">
              <Input value={colorCode} onChange={(e) => setColorCode(e.target.value)} placeholder="BLACK" data-testid="new-color-code" />
            </Field>
          </div>
          <Button size="sm" className="self-start" loading={busy} onClick={() => void saveColor()}>
            Сохранить цвет и продолжить
          </Button>
        </div>
      )}
    </div>
  );
}

function ColorPlanRow({
  index,
  model,
  color,
  existingColors,
  onRemove,
  onPatch,
}: {
  index: number;
  model: ModelBlockState;
  color: ColorPlanState;
  existingColors: string[];
  onRemove: () => void;
  onPatch: (patch: Partial<ColorPlanState>) => void;
}) {
  const sizes = sizesForColor(model, color.color);
  const percentagesList = sizes.map((size) => ({ size, percent: color.percentages[size] ?? 0 }));
  const sum = percentSum(percentagesList);
  const preview = model.distributionMode === "template" && color.quantity ? distributeQuantityByPercentPreview(percentagesList, color.quantity) : null;

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-border p-3" data-testid={`color-row-${index}`}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Цвет" className="min-w-[180px]">
          <Select value={color.color} onValueChange={(value) => onPatch({ color: value, percentages: equalPercentages(sizesForColor(model, value)) })}>
            <SelectTrigger data-testid="color-select">
              <SelectValue placeholder="Выберите цвет" />
            </SelectTrigger>
            <SelectContent>
              {existingColors.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {model.distributionMode === "template" && (
          <Field label="Количество">
            <NumberInput
              value={color.quantity}
              onChange={(v) => onPatch({ quantity: v })}
              min={1}
              className="w-32"
              data-testid="color-quantity"
            />
          </Field>
        )}
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Убрать цвет
        </Button>
      </div>

      {sizes.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {sizes.map((size) => (
            <Field key={size} label={size} className="w-28">
              {model.distributionMode === "template" ? (
                <PercentInput
                  value={color.percentages[size]}
                  onChange={(v) => onPatch({ percentages: { ...color.percentages, [size]: v } })}
                  data-testid={`percent-${size}`}
                />
              ) : (
                <NumberInput
                  value={color.cells[size]}
                  onChange={(v) => onPatch({ cells: { ...color.cells, [size]: v } })}
                  min={0}
                  data-testid={`cell-${size}`}
                />
              )}
            </Field>
          ))}
        </div>
      )}

      {model.distributionMode === "template" && (
        <p
          className={`text-[12px] ${Math.abs(sum - 100) > 0.01 ? "font-medium text-danger" : "text-muted-foreground"}`}
          data-testid="percent-sum"
        >
          Сумма долей: {sum.toFixed(1)}% {Math.abs(sum - 100) > 0.01 && "— должно быть 100%"}
        </p>
      )}
      {preview && (
        <p className="text-[12px] text-muted-foreground" data-testid="distribution-preview">
          Предпросмотр: {preview.map((row) => `${row.size} — ${row.quantity}`).join(", ")} (итого {preview.reduce((s, r) => s + r.quantity, 0)})
        </p>
      )}
      {model.distributionMode === "manual" && sizes.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Итого: {sizes.reduce((s, size) => s + (color.cells[size] ?? 0), 0)}
        </p>
      )}
    </div>
  );
}
