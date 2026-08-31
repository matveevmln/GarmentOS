import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createProductVariantSchema,
  type BomItemDraft,
  type BomResponseDto,
  type CreateProductVariantDto,
  type MaterialResponseDto,
  type ProductResponseDto,
  type ProductSizeResponseDto,
  type ProductVariantResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, SectionLabel } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Combobox } from "../design-system/Select/Combobox";
import { NumberInput } from "../design-system/Input/NumberInput";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { unitLabel } from "../lib/format";

// Шестой из 7 перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md, задача #72).
// Честная находка при переносе: этот экран технически отвечает на 3 разных
// вопроса («что это за модель», «какие у неё SKU», «какая у неё
// спецификация») — формально нарушает docs/PRINCIPLES.md принцип 22 («один
// экран — один вопрос»). Разделение на отдельные маршруты — решение об
// информационной архитектуре (новые URL, навигация), не «мелкое улучшение
// интерфейса»; в рамках этого прохода экран визуально приведён к дизайн-
// системе и разделён на 3 явные карточки-секции без изменения структуры
// маршрутов — сам вопрос "разделить ли на отдельные страницы" зафиксирован
// как отдельная тема, не решается здесь по собственной инициативе.
//
// Также исправлен реальный пробел: apiRequest(`/products/${id}`) не имел
// .catch() — при сбое сети экран навсегда оставался в состоянии
// "Загрузка…", неотличимом от нормальной загрузки (UX_PRINCIPLES.md §5).
export function ProductDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductResponseDto | null>(null);
  const [productError, setProductError] = useState(false);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [boms, setBoms] = useState<BomResponseDto[]>([]);
  const [bomItems, setBomItems] = useState<BomItemDraft[]>([]);
  const [isSubmittingBom, setIsSubmittingBom] = useState(false);
  const [approvingBomId, setApprovingBomId] = useState<string | null>(null);
  const [pendingMaterialId, setPendingMaterialId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState<number | undefined>(undefined);
  const [pendingWaste, setPendingWaste] = useState<number | undefined>(undefined);

  // Размерный ряд: порядок размеров и веса раскладки (владелец проекта,
  // 2026-08-30). Живёт отдельным состоянием, потому что редактируется целиком
  // и сохраняется одной кнопкой — порядок и веса меняются вместе.
  const [sizeRows, setSizeRows] = useState<ProductSizeResponseDto[]>([]);
  const [isSavingSizes, setIsSavingSizes] = useState(false);
  const [previewQuantity, setPreviewQuantity] = useState<number | undefined>(500);
  const [newColor, setNewColor] = useState("");
  const [newColorCode, setNewColorCode] = useState("");
  const [isAddingColor, setIsAddingColor] = useState(false);

  const loadSizes = () => {
    if (!id) return;
    void apiRequest<ProductSizeResponseDto[]>(`/products/${id}/sizes`).then(setSizeRows).catch(() => setSizeRows([]));
  };
  useEffect(loadSizes, [id]);

  // Живой предпросмотр: «на 500 изделий получится 61 / 126 / 126 / 126 / 61».
  // Считается тем же методом наибольших остатков, что и на сервере, — числа
  // сходятся, а пользователь видит результат до сохранения.
  const previewSizes = (): number[] => {
    const total = previewQuantity ?? 0;
    const weights = sizeRows.map((row) => row.ratioWeight);
    const sum = weights.reduce((acc, w) => acc + w, 0);
    if (total <= 0 || sum <= 0) return sizeRows.map(() => 0);
    const raw = weights.map((w) => (w / sum) * total);
    const base = raw.map((value) => Math.floor(value));
    let remainder = total - base.reduce((acc, value) => acc + value, 0);
    const order = raw
      .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
      .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
    for (const { index } of order) {
      if (remainder <= 0) break;
      base[index] = (base[index] ?? 0) + 1;
      remainder -= 1;
    }
    return base;
  };

  const saveSizes = async () => {
    if (!id) return;
    setIsSavingSizes(true);
    try {
      const saved = await apiRequest<ProductSizeResponseDto[]>(`/products/${id}/sizes`, {
        method: "PUT",
        body: { sizes: sizeRows.map((row) => ({ size: row.size, ratioWeight: row.ratioWeight })) },
      });
      setSizeRows(saved);
      toast.success("Размерный ряд сохранён", {
        description: "Новые заказы получат эту раскладку. Созданные ранее заказы не изменятся.",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить размерный ряд");
    } finally {
      setIsSavingSizes(false);
    }
  };

  const addColor = async () => {
    if (!id || !newColor.trim() || !newColorCode.trim()) return;
    setIsAddingColor(true);
    try {
      const res = await apiRequest<{ created: number; skipped: number }>(`/products/${id}/colors`, {
        method: "POST",
        body: { color: newColor.trim(), colorCode: newColorCode.trim() },
      });
      setNewColor("");
      setNewColorCode("");
      await reloadVariants();
      toast.success(`Цвет добавлен на все размеры`, {
        description: `Создано вариантов: ${res.created}${res.skipped ? `, уже было: ${res.skipped}` : ""}`,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось добавить цвет");
    } finally {
      setIsAddingColor(false);
    }
  };

  const {
    items: variants,
    isLoading: variantsLoading,
    create: createVariant,
    reload: reloadVariants,
  } = useCrudResource<ProductVariantResponseDto, CreateProductVariantDto>(`/product-variants?productId=${id}`);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Omit<CreateProductVariantDto, "productId">>({
    resolver: zodResolver(createProductVariantSchema.omit({ productId: true })),
  });

  const reloadBoms = async () => {
    if (!id) return;
    const data = await apiRequest<BomResponseDto[]>(`/boms?productId=${id}`);
    setBoms(data);
  };

  const loadProduct = () => {
    if (!id) return;
    setProductError(false);
    Promise.all([
      apiRequest<ProductResponseDto>(`/products/${id}`).then(setProduct),
      apiRequest<MaterialResponseDto[]>("/materials").then(setMaterials),
      reloadBoms(),
    ]).catch(() => setProductError(true));
  };

  useEffect(() => {
    loadProduct();
  }, [id]);

  const onSubmitVariant = async (data: Omit<CreateProductVariantDto, "productId">) => {
    if (!id) return;
    try {
      await createVariant({ ...data, productId: id });
      reset();
      toast.success("Вариант модели добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось добавить вариант модели");
    }
  };

  const addBomItem = () => {
    if (!pendingMaterialId || !pendingQuantity) return;
    setBomItems((prev) => [...prev, { materialId: pendingMaterialId, quantityPerUnit: pendingQuantity, wastePercent: pendingWaste }]);
    setPendingMaterialId("");
    setPendingQuantity(undefined);
    setPendingWaste(undefined);
  };

  // Актуальная версия — старшая среди утверждённых. Ровно то же правило, по
  // которому сервер выбирает нормы для нового заказа, поэтому интерфейс не
  // может разойтись с расчётом.
  const currentBomId =
    boms
      .filter((bom) => bom.status === "approved")
      .sort((a, b) => b.version - a.version)[0]?.id ?? null;

  const describeNorms = (bom: BomResponseDto): string => {
    if (bom.items.length === 0) return "—";
    return bom.items
      .map((item) => {
        const material = materials.find((m) => m.id === item.materialId);
        const unit = material ? unitLabel(material.unit) : "";
        const waste = Number(item.wastePercent) > 0 ? ` (+${Number(item.wastePercent)}% отходы)` : "";
        return `${material?.name ?? item.materialId} — ${Number(item.quantityPerUnit)} ${unit}/шт${waste}`;
      })
      .join("; ");
  };

  // Сохранение норм — одно действие вместо двух шагов (владелец проекта,
  // решение Д): создаётся новая версия и сразу становится актуальной для
  // новых заказов. Промежуточный черновик пользователю ничего не давал —
  // уже созданные партии защищены собственными зафиксированными нормами и
  // от новой версии не меняются.
  //
  // Механизм версий используется существующий, второй не заводится: номер
  // версии проставляет сервер (следующий по счёту для этой модели),
  // предыдущие версии не переписываются и остаются в истории.
  const submitBom = async () => {
    if (!id || bomItems.length === 0) return;
    setIsSubmittingBom(true);
    try {
      const created = await apiRequest<BomResponseDto>(`/boms`, {
        method: "POST",
        body: { productId: id, items: bomItems },
      });
      await apiRequest(`/boms/${created.id}/approve`, { method: "POST" });
      setBomItems([]);
      await reloadBoms();
      toast.success(`Нормы сохранены — версия ${created.version}`, {
        description: "Новые заказы получат эту версию. Созданные ранее партии не изменятся.",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сохранить нормы расхода");
    } finally {
      setIsSubmittingBom(false);
    }
  };

  const approveBom = async (bomId: string) => {
    setApprovingBomId(bomId);
    try {
      await apiRequest(`/boms/${bomId}/approve`, { method: "POST" });
      await reloadBoms();
      toast.success("Версия норм сделана актуальной");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось сделать версию актуальной");
    } finally {
      setApprovingBomId(null);
    }
  };

  if (productError) {
    return <ErrorState title="Не удалось загрузить модель" onRetry={loadProduct} />;
  }

  if (!product) return <SkeletonList />;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title={product.name}
        subtitle={
          <span className="flex items-center gap-2">
            <span className="num">Артикул {product.code}</span>
            <StatusBadge status={product.status} />
          </span>
        }
        breadcrumbs={
          <Breadcrumbs
            items={[
              { label: "GarmentOS" },
              { label: "Модели", onClick: () => void navigate("/products") },
              { label: product.name },
            ]}
          />
        }
      />

      {/* Размерный ряд — источник порядка размеров и пропорции раскладки для
          НОВЫХ заказов. Уже созданные заказы правка не затрагивает: их
          матрица хранится собственными строками. */}
      <Card>
        <CardHeader>
          <CardTitle>Размерный ряд</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="t-secondary">
            Задайте размеры по порядку и их соотношение своими рабочими числами — например 185 / 381 / 381 / 381 / 186.
            Это пропорция, а не готовое количество: система разложит по ней любой объём заказа.
          </p>

          <div className="flex flex-col gap-2">
            {sizeRows.map((row, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2 rounded-[10px] border border-border bg-muted/40 p-2.5">
                <Field label="Размер" className="min-w-[110px] flex-1">
                  <Input
                    value={row.size}
                    onChange={(event) =>
                      setSizeRows((prev) => prev.map((r, i) => (i === index ? { ...r, size: event.target.value } : r)))
                    }
                    placeholder="48-50"
                  />
                </Field>
                <Field label="Доля" className="min-w-[100px] flex-1">
                  <NumberInput
                    value={row.ratioWeight}
                    onChange={(value) =>
                      setSizeRows((prev) => prev.map((r, i) => (i === index ? { ...r, ratioWeight: value ?? 0 } : r)))
                    }
                    min={0}
                    decimals={2}
                  />
                </Field>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={index === 0}
                    onClick={() =>
                      setSizeRows((prev) => {
                        const next = [...prev];
                        const item = next[index];
                        const above = next[index - 1];
                        if (!item || !above) return prev;
                        next[index - 1] = item;
                        next[index] = above;
                        return next;
                      })
                    }
                    aria-label="Выше"
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={index === sizeRows.length - 1}
                    onClick={() =>
                      setSizeRows((prev) => {
                        const next = [...prev];
                        const item = next[index];
                        const below = next[index + 1];
                        if (!item || !below) return prev;
                        next[index + 1] = item;
                        next[index] = below;
                        return next;
                      })
                    }
                    aria-label="Ниже"
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setSizeRows((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Убрать размер"
                  >
                    Убрать
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setSizeRows((prev) => [...prev, { size: "", sortOrder: prev.length, ratioWeight: 1 }])
              }
            >
              Добавить размер
            </Button>
            {sizeRows.length === 0 && variants.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  // Порядок берётся из порядка создания вариантов, доли —
                  // равные. Это заготовка «чтобы было с чего начать», её
                  // нужно поправить руками: угадывать пропорцию нельзя.
                  const unique: string[] = [];
                  for (const variant of variants) if (!unique.includes(variant.size)) unique.push(variant.size);
                  setSizeRows(unique.map((size, index) => ({ size, sortOrder: index, ratioWeight: 1 })));
                }}
              >
                Заполнить из существующих размеров
              </Button>
            )}
            <Button type="button" size="sm" loading={isSavingSizes} disabled={sizeRows.length === 0} onClick={() => void saveSizes()}>
              Сохранить размерный ряд
            </Button>
          </div>

          {sizeRows.length > 0 && (
            <div className="rounded-[10px] border border-border bg-secondary/50 p-3.5">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Проверить на количестве" className="min-w-[160px]">
                  <NumberInput value={previewQuantity} onChange={setPreviewQuantity} min={0} />
                </Field>
                <p className="t-secondary pb-2">
                  {sizeRows.map((row, index) => `${row.size || "?"} — ${previewSizes()[index] ?? 0}`).join(" · ")}
                </p>
              </div>
              <p className="t-meta mt-1">
                Сумма всегда точно равна количеству заказа. Правка ряда действует только на новые заказы.
              </p>
            </div>
          )}

          {/* Цвет добавляется сразу на все размеры ряда — иначе сетка
              5 размеров × 3 цвета требует пятнадцати ручных операций. */}
          <div className="rounded-[10px] border border-border bg-muted/40 p-3.5">
            <SectionLabel>Добавить цвет на все размеры</SectionLabel>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <Field label="Цвет" className="min-w-[140px] flex-1">
                <Input value={newColor} onChange={(event) => setNewColor(event.target.value)} placeholder="Петроль" />
              </Field>
              <Field label="Код цвета для артикула" className="min-w-[160px] flex-1">
                <Input value={newColorCode} onChange={(event) => setNewColorCode(event.target.value)} placeholder="PETROL" />
              </Field>
              <Button
                type="button"
                size="sm"
                loading={isAddingColor}
                disabled={sizeRows.length === 0 || !newColor.trim() || !newColorCode.trim()}
                onClick={() => void addColor()}
              >
                Добавить цвет
              </Button>
            </div>
            {sizeRows.length === 0 && (
              <p className="t-meta mt-2">Сначала задайте и сохраните размерный ряд.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Размеры и цвета</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/40 p-3.5 sm:flex-row sm:flex-wrap sm:items-end"
            onSubmit={(event) => void handleSubmit(onSubmitVariant)(event)}
          >
            <Field label="Размер" className="min-w-[100px] flex-1">
              <Input {...register("size")} placeholder="M" />
            </Field>
            <Field label="Цвет" className="min-w-[120px] flex-1">
              <Input {...register("color")} placeholder="Петроль" />
            </Field>
            <Field label="Артикул варианта" className="min-w-[160px] flex-1">
              <Input {...register("skuCode")} placeholder={`${product.code}-M-PETROL`} />
            </Field>
            <Button type="submit" size="sm" loading={isSubmitting} className="sm:w-auto">
              Добавить размер и цвет
            </Button>
          </form>
          {(errors.size ?? errors.color ?? errors.skuCode) && (
            <p className="text-[0.8rem] font-semibold text-destructive">Заполните размер, цвет и артикул варианта</p>
          )}

          {variantsLoading ? (
            <SkeletonList rows={2} />
          ) : (
            variants.length === 0 ? (
              <EmptyState compact title="Пока нет ни одного варианта модели" description="Добавьте размер и цвет в форме выше." />
            ) : (
              <>
                {/* Плотная таблица на планшете и десктопе — как на всех
                    остальных справочных экранах (этап 9, пункт B3). */}
                <div className="hidden md:block">
                  <DataTable
                    columns={[
                      { key: "size", label: "Размер", width: "120px" },
                      { key: "color", label: "Цвет" },
                      { key: "sku", label: "Артикул варианта", align: "right", width: "240px" },
                    ]}
                  >
                    {variants.map((row) => (
                      <tr key={row.id} className="cursor-default">
                        <Td className="t-object">{row.size}</Td>
                        <Td className="text-muted-foreground">{row.color}</Td>
                        <Td align="right" className="num text-muted-foreground">
                          {row.skuCode}
                        </Td>
                      </tr>
                    ))}
                  </DataTable>
                </div>

                <div className="space-y-2 md:hidden">
                  {variants.map((row) => (
                    <MobileListItem key={row.id}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[13px] font-medium">
                          {row.size} / {row.color}
                        </span>
                        <span className="num text-[12px] text-muted-foreground">{row.skuCode}</span>
                      </div>
                    </MobileListItem>
                  ))}
                </div>
              </>
            )
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Нормы расхода материалов</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/40 p-3.5 sm:flex-row sm:flex-wrap sm:items-end">
            <Field label="Материал" className="min-w-[160px] flex-1">
              <Combobox
                value={pendingMaterialId}
                onChange={setPendingMaterialId}
                placeholder="Выберите материал"
                searchPlaceholder="Поиск материала..."
                options={materials.map((material) => ({ value: material.id, label: material.name }))}
              />
            </Field>
            <Field label="Расход на единицу" className="min-w-[120px] flex-1">
              <NumberInput value={pendingQuantity} onChange={setPendingQuantity} min={0} decimals={3} />
            </Field>
            <Field label="Отходы" className="min-w-[100px] flex-1">
              <NumberInput value={pendingWaste} onChange={setPendingWaste} min={0} max={100} decimals={1} suffix="%" />
            </Field>
            <Button type="button" variant="secondary" size="sm" onClick={addBomItem} className="sm:w-auto">
              Добавить строку
            </Button>
          </div>

          {bomItems.length > 0 && (
            <ul className="m-0 list-none p-0 text-[0.9rem] text-muted-foreground">
              {bomItems.map((item, index) => (
                <li key={index} className="flex justify-between border-b border-border py-1.5 last:border-none">
                  <span>{materials.find((m) => m.id === item.materialId)?.name ?? item.materialId}</span>
                  <span className="tabular-nums">
                    {item.quantityPerUnit}
                    {item.wastePercent ? ` (+${item.wastePercent}% отходы)` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {bomItems.length > 0 && (
            <Button type="button" loading={isSubmittingBom} onClick={() => void submitBom()}>
              Сохранить нормы новой версией
            </Button>
          )}

          {boms.length === 0 ? (
            <EmptyState compact title="Нормы расхода ещё не заданы" description="Добавьте материалы в форме выше." />
          ) : (
            <>
              {/* История версий: старые не переписываются и остаются
                  видимыми. Актуальная — та, по которой пойдут НОВЫЕ заказы;
                  уже созданные партии хранят собственные зафиксированные
                  нормы и от смены версии не меняются. */}
              <div className="hidden md:block">
                <DataTable
                  columns={[
                    { key: "version", label: "Версия", width: "150px" },
                    { key: "items", label: "Материалы и нормы" },
                    { key: "status", label: "Статус", align: "right", width: "180px" },
                  ]}
                >
                  {boms.map((row) => (
                    <tr key={row.id} className="cursor-default">
                      <Td className="t-object">
                        Версия {row.version}
                        {row.id === currentBomId ? (
                          <span className="mt-0.5 block text-[11px] font-medium text-success">Актуальная</span>
                        ) : null}
                      </Td>
                      <Td className="text-muted-foreground">{describeNorms(row)}</Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-2">
                          {row.status === "draft" ? (
                            <Button
                              type="button"
                              size="sm"
                              loading={approvingBomId === row.id}
                              onClick={() => void approveBom(row.id)}
                            >
                              Сделать актуальной
                            </Button>
                          ) : (
                            <StatusBadge status={row.status} />
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </DataTable>
              </div>

              <div className="space-y-2 md:hidden">
                {boms.map((row) => (
                  <MobileListItem
                    key={row.id}
                    footer={
                      row.status === "draft" ? (
                        <div className="mt-3 border-t border-border pt-3">
                          <Button
                            type="button"
                            size="sm"
                            loading={approvingBomId === row.id}
                            onClick={() => void approveBom(row.id)}
                          >
                            Утвердить
                          </Button>
                        </div>
                      ) : undefined
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium">Версия {row.version}</div>
                        <div className="num mt-1 text-[12px] text-muted-foreground">
                          {row.items.length} материалов
                        </div>
                      </div>
                      {row.status !== "draft" ? <StatusBadge status={row.status} /> : null}
                    </div>
                  </MobileListItem>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
