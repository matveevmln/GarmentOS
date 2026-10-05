import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import {
  quickProductSchema,
  placeProductionOrderSchema,
  type PlaceProductionOrderDto,
  type DocumentResponseDto,
  type ProductResponseDto,
  type ProductVariantResponseDto,
  type ProductSizeResponseDto,
  type WorkshopResponseDto,
  type ProductionOrderResponseDto,
  type PreviewProductionOrderVariantsResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../design-system/Button/Button";
import { Input } from "../design-system/Input/Input";
import { NumberInput } from "../design-system/Input/NumberInput";
import { Field } from "../design-system/Form/Field";
import { ModelThumb } from "../design-system/Blocks/BatchCard";
import { MobileActionBar } from "../design-system/Blocks/MobileActionBar";
import { ArrowLeft, X, Minus, Plus } from "lucide-react";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { SkeletonList } from "../design-system/Feedback/Skeleton";

const rowSchema = z.object({
  productVariantId: z.string().uuid(),
  size: z.string(),
  color: z.string(),
  quantity: z.number().int().min(0),
});
const draftSchema = z.object({
  step: z.number().int().min(0).max(3),
  productId: z.string(),
  workshopId: z.string(),
  name: z.string(),
  sizes: z.string(),
  colors: z.string(),
  setup: z.boolean(),
  modelRequestId: z.string().uuid(),
  requestId: z.string().uuid(),
  quantities: z.record(z.string(), z.number().int().min(0)),
  rows: z.array(rowSchema),
  price: z.number().min(0),
  dueDate: z.string(),
  pending: placeProductionOrderSchema.nullable(),
  modelPending: quickProductSchema.nullable().default(null),
});
type Draft = z.infer<typeof draftSchema>;
const TITLES = ["Модель", "Количество", "Цена и срок", "Проверка"];
const splitNames = (value: string) => [
  ...new Set(
    value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];
const inputClass = "min-h-11 text-base";

function fresh(productId = ""): Draft {
  return {
    step: 0,
    productId,
    workshopId: "",
    name: "",
    sizes: "",
    colors: "",
    setup: false,
    modelRequestId: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    quantities: {},
    rows: [],
    price: 0,
    dueDate: "",
    pending: null,
    modelPending: null,
  };
}

export function NewBatchWizardPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const key = `garmentos.batch-draft:${user?.companyId}:${user?.id}`;
  const [restored] = useState(() => {
    try {
      return draftSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null")).success;
    } catch {
      return false;
    }
  });
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const parsed = draftSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
      if (parsed.success) return parsed.data;
    } catch {
      /* Повреждённый кеш не мешает начать заново. */
    }
    return fresh(params.get("productId") ?? "");
  });
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [photoDocumentId, setPhotoDocumentId] = useState<string | null>(null);
  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);
  const [sizes, setSizes] = useState<ProductSizeResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modelLoading, setModelLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const update = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [draft, key]);

  const load = () => {
    setLoading(true);
    setError("");
    void Promise.all([
      apiRequest<ProductResponseDto[]>("/products"),
      apiRequest<WorkshopResponseDto[]>("/workshops"),
    ])
      .then(([models, shops]) => {
        setDraft((prev) => ({
          ...prev,
          name: prev.name || models.find((model) => model.id === prev.productId)?.name || "",
        }));
        setProducts(models.filter((model) => !model.deletedAt && model.status !== "discontinued"));
        const active = shops.filter((shop) => shop.status === "active");
        setWorkshops(active);
        if (active.length === 1)
          setDraft((prev) => ({ ...prev, workshopId: prev.workshopId || active[0].id }));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить данные"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    if (!draft.productId) {
      setVariants([]);
      setSizes([]);
      return;
    }
    let live = true;
    setVariants([]);
    setSizes([]);
    setModelLoading(true);
    void Promise.all([
      apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${draft.productId}`),
      apiRequest<ProductSizeResponseDto[]>(`/products/${draft.productId}/sizes`),
    ])
      .then(([rows, sizeRows]) => {
        if (!live) return;
        setVariants(rows);
        setSizes(sizeRows);
        if (rows.length === 0)
          setDraft((prev) => ({
            ...prev,
            setup: true,
            sizes: prev.sizes || sizeRows.map((row) => row.size).join(", "),
          }));
      })
      .catch((err) => {
        if (live) setError(err instanceof Error ? err.message : "Не удалось загрузить размеры");
      })
      .finally(() => {
        if (live) setModelLoading(false);
      });
    return () => {
      live = false;
    };
  }, [draft.productId]);

  useEffect(() => {
    let live = true;
    setPhotoDocumentId(null);
    if (draft.productId)
      void apiRequest<DocumentResponseDto[]>(
        `/documents?entityType=product&entityId=${draft.productId}`,
      )
        .then((docs) => {
          if (live)
            setPhotoDocumentId(
              docs.find((doc) => doc.docType === "photo_product" && doc.isCurrentVersion)?.id ??
                null,
            );
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft.productId]);
  const product = products.find((model) => model.id === draft.productId);
  const colorNames = [
    ...new Set(
      variants
        .filter((row) => sizes.length === 0 || sizes.some((size) => size.size === row.size))
        .map((row) => row.color),
    ),
  ];
  const total = draft.rows.reduce((sum, row) => sum + row.quantity, 0);
  const totalRequested = Object.values(draft.quantities).reduce((sum, qty) => sum + qty, 0);
  const workshop = workshops.find((shop) => shop.id === draft.workshopId);
  const fail = (message: string) => {
    setError(message);
  };

  const next = async (redistribute = false) => {
    setError("");
    setBusy(true);
    try {
      if (draft.step === 0) {
        if (draft.productId && !product)
          return fail("Модель недоступна. Выберите рабочую модель или восстановите её из архива.");
        if (!draft.productId && !draft.setup) return fail("Выберите модель или добавьте новую");
        if (draft.setup) {
          const sizeNames = splitNames(draft.sizes);
          const colors = splitNames(draft.colors);
          if (!draft.name.trim() || !sizeNames.length || !colors.length)
            return fail("Укажите название, размеры и хотя бы один цвет");
          const payload =
            draft.modelPending ??
            quickProductSchema.parse({
              requestId: draft.modelRequestId,
              productId: draft.productId || undefined,
              name: draft.name.trim(),
              sizes: sizeNames.map((size) => ({
                size,
                ratioWeight: sizes.find((row) => row.size === size)?.ratioWeight ?? 1,
              })),
              colors,
            });
          const pendingDraft = { ...draft, modelPending: payload };
          try {
            localStorage.setItem(key, JSON.stringify(pendingDraft));
          } catch {
            setStorageError(true);
          }
          setDraft(pendingDraft);
          const model = await apiRequest<ProductResponseDto>("/products/quick", {
            method: "POST",
            body: payload,
          });
          setProducts((prev) => [...prev.filter((row) => row.id !== model.id), model]);
          update({ productId: model.id, modelPending: null, setup: false, step: 1 });
          const [rows, sizeRows] = await Promise.all([
            apiRequest<ProductVariantResponseDto[]>(`/product-variants?productId=${model.id}`),
            apiRequest<ProductSizeResponseDto[]>(`/products/${model.id}/sizes`),
          ]);
          setVariants(rows);
          setSizes(sizeRows);
        } else if (!variants.length) return fail("Добавьте размеры и цвет этой модели");
        else update({ step: 1 });
      } else if (draft.step === 1) {
        if (!totalRequested) return fail("Укажите количество хотя бы для одного цвета");
        if (Object.values(draft.quantities).some((qty) => !Number.isInteger(qty) || qty < 0))
          return fail("Укажите целое число изделий для каждого цвета");
        if (draft.rows.some((row) => !Number.isInteger(row.quantity) || row.quantity < 0))
          return fail("Количество изделий по каждому размеру должно быть целым");
        if (redistribute || !draft.rows.length) {
          const preview = await apiRequest<PreviewProductionOrderVariantsResponseDto>(
            "/production-orders/preview-variants",
            {
              method: "POST",
              body: {
                productId: draft.productId,
                colors: colorNames
                  .filter((color) => draft.quantities[color] > 0)
                  .map((color) => ({ color, quantity: draft.quantities[color] })),
                distributionMode: "ratio",
              },
            },
          );
          if (preview.missingVariants.length)
            return fail(
              "У модели не хватает сочетаний размеров и цветов. Откройте “Настроить размеры и цвета” на первом шаге.",
            );
          // Сохраняем нулевые строки: маленькая партия может распределиться не на все размеры.
          const rows = preview.rows;
          update({ rows });
          if (rows.reduce((sum, row) => sum + row.quantity, 0) !== totalRequested)
            return fail("Количество по размерам не совпадает с общим количеством");
          return;
        }
        if (total !== totalRequested)
          return fail(
            `По размерам ${total} шт., а по цветам ${totalRequested} шт. Исправьте количества.`,
          );
        for (const color of colorNames) {
          if (
            draft.rows
              .filter((row) => row.color === color)
              .reduce((sum, row) => sum + row.quantity, 0) !== (draft.quantities[color] ?? 0)
          )
            return fail(`Количество по размерам цвета “${color}” не совпадает с итогом цвета`);
        }
        update({ step: 2 });
      } else if (draft.step === 2) {
        if (!(draft.price > 0)) return fail("Укажите согласованную цену пошива за изделие");
        if (!workshop)
          return fail(
            "Выберите цех. Если список пуст, сначала добавьте цех в разделе “Ещё → Мой цех”.",
          );
        if (!workshop.contractNumber)
          return fail(
            "У цеха не указан номер договора. Заполните его в “Мой цех” перед размещением партии.",
          );
        update({ step: 3 });
      }
    } catch (err) {
      if (err instanceof ApiError && [400, 403, 404, 422].includes(err.status))
        update({ modelPending: null });
      setError(
        err instanceof Error
          ? err.message
          : "Не удалось сохранить. Введённые данные остались на этом устройстве.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async (mode: "place" | "draft") => {
    setBusy(true);
    setError("");
    try {
      const payload: PlaceProductionOrderDto =
        draft.pending ??
        placeProductionOrderSchema.parse({
          requestId: draft.requestId,
          mode,
          productId: draft.productId,
          workshopId: draft.workshopId,
          plannedQuantity: total,
          agreedUnitPrice: draft.price,
          dueDate: draft.dueDate || undefined,
          variants: draft.rows
            .filter((row) => row.quantity > 0)
            .map(({ productVariantId, quantity }) => ({ productVariantId, quantity })),
        });
      const pendingDraft = { ...draft, pending: payload };
      // Записываем попытку до HTTP-запроса, чтобы потерянный ответ можно было безопасно повторить.
      try {
        localStorage.setItem(key, JSON.stringify(pendingDraft));
      } catch {
        setStorageError(true);
      }
      setDraft(pendingDraft);
      const order = await apiRequest<ProductionOrderResponseDto>("/production-orders/place", {
        method: "POST",
        body: payload,
      });
      localStorage.removeItem(key);
      void navigate(`/production-orders/${order.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && [400, 403, 404, 422].includes(err.status))
        update({ pending: null });
      setError(
        err instanceof Error
          ? err.message
          : "Ответ не получен. Повторите сохранение этой же партии.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <SkeletonList />;
  if (!products.length && error && !workshops.length)
    return <ErrorState title={error} onRetry={load} />;
  return (
    <div className="seller-screen">
      <header className="mb-6 flex items-center justify-between gap-2">
        <button
          className="focus-ring grid h-11 w-11 place-items-center"
          aria-label="Назад к партиям"
          onClick={() => void navigate("/production-orders")}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="!text-xl">Новая партия</h1>
        <button
          className="focus-ring grid h-11 w-11 place-items-center"
          aria-label="Закрыть мастер"
          onClick={() => void navigate("/production-orders")}
        >
          <X size={22} />
        </button>
      </header>
      <p className="mb-3 text-sm text-muted-foreground">
        Шаг {draft.step + 1} из 4 · {TITLES[draft.step]}
      </p>
      {restored && (
        <p className="mb-3 text-sm text-muted-foreground">
          Восстановлено то, что вы заполняли на этом устройстве.
        </p>
      )}
      {storageError && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          Браузер не сохраняет черновик. Оставьте эту страницу открытой до завершения.
        </p>
      )}
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Шаги создания партии">
        {TITLES.map((title, index) => (
          <li
            key={title}
            aria-label={`Шаг ${index + 1}: ${title}`}
            aria-current={index === draft.step ? "step" : undefined}
            className={`h-1.5 rounded-full ${index <= draft.step ? "bg-[var(--seller-accent)]" : "bg-muted"}`}
          />
        ))}
      </ol>
      <div className="flex flex-col gap-4">
        <fieldset
          disabled={busy || Boolean(draft.pending) || Boolean(draft.modelPending)}
          className="flex min-w-0 flex-col gap-4"
        >
          {draft.step === 0 && (
            <>
              <Field label="Модель">
                <select
                  className={`field w-full rounded-lg border border-border bg-card px-3 ${inputClass}`}
                  aria-label="Модель"
                  value={draft.productId}
                  onChange={(event) =>
                    update({
                      productId: event.target.value,
                      name: products.find((model) => model.id === event.target.value)?.name || "",
                      sizes: "",
                      colors: "",
                      setup: false,
                      rows: [],
                      quantities: {},
                      modelRequestId: crypto.randomUUID(),
                    })
                  }
                >
                  <option value="">Выберите модель</option>
                  {products.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                variant="secondary"
                size="lg"
                onClick={() =>
                  update({
                    productId: "",
                    setup: true,
                    name: "",
                    sizes: "",
                    colors: "",
                    rows: [],
                    quantities: {},
                    modelRequestId: crypto.randomUUID(),
                  })
                }
              >
                + Новая модель
              </Button>
              {modelLoading && <p>Загружаем размеры и цвета…</p>}
              {product && !draft.setup && (
                <>
                  <p className="text-sm">
                    Размеры:{" "}
                    {[...new Set(variants.map((row) => row.size))].join(", ") || "ещё не заданы"}
                    <br />
                    Цвета: {colorNames.join(", ") || "ещё не заданы"}
                  </p>
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={() =>
                      update({
                        setup: true,
                        name: product.name,
                        sizes: (sizes.length
                          ? sizes.map((row) => row.size)
                          : [...new Set(variants.map((row) => row.size))]
                        ).join(", "),
                        colors: colorNames.join(", "),
                        modelRequestId: crypto.randomUUID(),
                      })
                    }
                  >
                    Настроить размеры и цвета
                  </Button>
                </>
              )}
              {draft.setup && (
                <>
                  <Field label="Название модели">
                    <Input
                      className={inputClass}
                      value={draft.name}
                      disabled={Boolean(draft.productId)}
                      onChange={(event) => update({ name: event.target.value })}
                      placeholder="Например, Хуплушка"
                    />
                  </Field>
                  <Field label="Размеры через запятую">
                    <Input
                      className={inputClass}
                      value={draft.sizes}
                      onChange={(event) => update({ sizes: event.target.value })}
                      placeholder="48-50, 52-54, 56-58"
                    />
                  </Field>
                  <Field
                    label={
                      draft.productId ? "Цвета для добавления через запятую" : "Цвета через запятую"
                    }
                  >
                    <Input
                      className={inputClass}
                      value={draft.colors}
                      onChange={(event) => update({ colors: event.target.value })}
                      placeholder="Петроль"
                    />
                  </Field>
                  <p className="text-sm text-muted-foreground">
                    Размеры и цвета сохранятся у модели для следующих партий. Фото можно добавить
                    позже.
                  </p>
                </>
              )}
            </>
          )}
          {draft.step === 1 && (
            <>
              <div className="seller-card flex items-center gap-3 bg-muted/30">
                <ModelThumb
                  photoDocumentId={photoDocumentId}
                  productName={product?.name ?? "Модель"}
                  size={40}
                />
                <strong className="text-sm">
                  {product?.name} · {colorNames.join(", ")}
                </strong>
              </div>
              {colorNames.map((color) => (
                <Field
                  key={color}
                  label={colorNames.length === 1 ? "Всего изделий" : `${color} · всего изделий`}
                >
                  <NumberInput
                    className={`${inputClass} seller-total-input`}
                    aria-label={
                      colorNames.length === 1 ? "Всего изделий" : `${color} · всего изделий`
                    }
                    min={0}
                    value={draft.quantities[color] || undefined}
                    onChange={(qty) =>
                      update({ quantities: { ...draft.quantities, [color]: qty ?? 0 }, rows: [] })
                    }
                    inputMode="numeric"
                  />
                </Field>
              ))}
              <Button variant="secondary" size="lg" onClick={() => void next(true)}>
                Распределить по размерам
              </Button>
              {draft.rows.length > 0 && (
                <>
                  <div className="divide-y divide-border">
                    {draft.rows.map((row, index) => (
                      <div key={row.productVariantId} className="flex items-center gap-2 py-3">
                        <span className="min-w-0 flex-1 text-sm">
                          {colorNames.length > 1 ? `${row.color} · ` : ""}
                          {row.size}
                        </span>
                        <button
                          type="button"
                          aria-label={`Уменьшить ${row.color} · ${row.size}`}
                          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-muted/40"
                          disabled={row.quantity === 0}
                          onClick={() =>
                            update({
                              rows: draft.rows.map((old, i) =>
                                i === index
                                  ? { ...old, quantity: Math.max(0, old.quantity - 1) }
                                  : old,
                              ),
                            })
                          }
                        >
                          <Minus size={18} />
                        </button>
                        <NumberInput
                          className={`${inputClass} w-16 text-center`}
                          aria-label={`${row.color} · ${row.size}`}
                          value={row.quantity}
                          min={0}
                          onChange={(qty) =>
                            update({
                              rows: draft.rows.map((old, i) =>
                                i === index ? { ...old, quantity: qty ?? 0 } : old,
                              ),
                            })
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Увеличить ${row.color} · ${row.size}`}
                          className="focus-ring grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-border bg-muted/40"
                          onClick={() =>
                            update({
                              rows: draft.rows.map((old, i) =>
                                i === index ? { ...old, quantity: old.quantity + 1 } : old,
                              ),
                            })
                          }
                        >
                          <Plus size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p
                    role="status"
                    className={`rounded-lg p-3 text-sm ${total === totalRequested && colorNames.every((color) => draft.rows.filter((row) => row.color === color).reduce((sum, row) => sum + row.quantity, 0) === (draft.quantities[color] ?? 0)) ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}
                  >
                    Распределено {total} из {totalRequested} изделий
                  </p>
                </>
              )}
            </>
          )}
          {draft.step === 2 && (
            <>
              <Field label="Цена пошива за изделие, ₽">
                <NumberInput
                  className={`${inputClass} seller-total-input`}
                  aria-label="Цена пошива за изделие, ₽"
                  decimals={2}
                  min={0}
                  value={draft.price || undefined}
                  onChange={(price) => update({ price: price ?? 0 })}
                  suffix="₽"
                />
              </Field>
              <p className="font-medium">
                {total} шт. × {draft.price || "—"} ₽ ={" "}
                {(total * draft.price).toLocaleString("ru-RU")} ₽
              </p>
              <Field label="Срок готовности (необязательно)">
                <Input
                  className={`${inputClass} seller-total-input`}
                  type="date"
                  aria-label="Срок готовности"
                  value={draft.dueDate}
                  onChange={(event) => update({ dueDate: event.target.value })}
                />
              </Field>
              {workshops.length === 1 ? (
                <p>
                  Цех: <strong>{workshops[0].name}</strong>
                </p>
              ) : (
                <Field label="Цех">
                  <select
                    className={`field w-full border border-border bg-card px-3 ${inputClass}`}
                    value={draft.workshopId}
                    aria-label="Цех"
                    onChange={(event) => update({ workshopId: event.target.value })}
                  >
                    <option value="">Выберите цех</option>
                    {workshops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {!workshops.length && (
                <Button variant="secondary" size="lg" onClick={() => void navigate("/workshops")}>
                  Добавить мой цех
                </Button>
              )}
            </>
          )}
          {draft.step === 3 && (
            <>
              <h2 className="text-lg font-semibold">Проверьте партию</h2>
              <p>
                <strong>{product?.name}</strong>
                <br />
                Цех: {workshop?.name}
                <br />
                Количество: {total} шт.
                <br />
                Пошив: {draft.price} ₽ за изделие
                <br />
                Итого: {(total * draft.price).toLocaleString("ru-RU")} ₽<br />
                Срок: {draft.dueDate || "не указан"}
              </p>
              <ul className="flex flex-col gap-2">
                {draft.rows
                  .filter((row) => row.quantity > 0)
                  .map((row) => (
                    <li key={row.productVariantId}>
                      {row.color} · {row.size}: <strong>{row.quantity} шт.</strong>
                    </li>
                  ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                При размещении партия и её спецификация сохранятся вместе. Затем в карточке партии
                появится следующий шаг. Отправка документов цеху — отдельное действие.
              </p>
            </>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {draft.pending && (
          <p className="text-sm">
            Ожидаем подтверждение этой попытки. Повторное нажатие вернёт ту же партию.
          </p>
        )}
        {draft.step === 3 && !draft.pending && (
          <Button variant="ghost" disabled={busy} onClick={() => void submit("draft")}>
            Сохранить как черновик
          </Button>
        )}
        <MobileActionBar wizard>
          {draft.step > 0 && !draft.pending && !draft.modelPending && (
            <Button
              size="lg"
              variant="secondary"
              className="!flex-[0.65]"
              disabled={busy}
              onClick={() => update({ step: draft.step - 1 })}
            >
              Назад
            </Button>
          )}
          {draft.step < 3 ? (
            <Button
              size="lg"
              loading={busy}
              disabled={modelLoading || (draft.step === 1 && !draft.rows.length)}
              onClick={() => void next()}
            >
              {draft.modelPending ? "Повторить сохранение модели" : "Далее"}
            </Button>
          ) : (
            <Button size="lg" loading={busy} onClick={() => void submit("place")}>
              {draft.pending ? "Повторить сохранение" : "Разместить партию"}
            </Button>
          )}
        </MobileActionBar>
      </div>
    </div>
  );
}
