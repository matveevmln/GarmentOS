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
  type ProductVariantResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../design-system/ListCard/ListCard";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Combobox } from "../design-system/Select/Combobox";
import { NumberInput } from "../design-system/Input/NumberInput";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";

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

  const {
    items: variants,
    isLoading: variantsLoading,
    create: createVariant,
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
      toast.success("SKU добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось добавить SKU");
    }
  };

  const addBomItem = () => {
    if (!pendingMaterialId || !pendingQuantity) return;
    setBomItems((prev) => [...prev, { materialId: pendingMaterialId, quantityPerUnit: pendingQuantity, wastePercent: pendingWaste }]);
    setPendingMaterialId("");
    setPendingQuantity(undefined);
    setPendingWaste(undefined);
  };

  const submitBom = async () => {
    if (!id || bomItems.length === 0) return;
    setIsSubmittingBom(true);
    try {
      await apiRequest(`/boms`, { method: "POST", body: { productId: id, items: bomItems } });
      setBomItems([]);
      await reloadBoms();
      toast.success("Спецификация сохранена черновиком");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать спецификацию (BOM)");
    } finally {
      setIsSubmittingBom(false);
    }
  };

  const approveBom = async (bomId: string) => {
    setApprovingBomId(bomId);
    try {
      await apiRequest(`/boms/${bomId}/approve`, { method: "POST" });
      await reloadBoms();
      toast.success("Спецификация утверждена");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось утвердить спецификацию");
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

      <Card>
        <CardHeader>
          <CardTitle>Размеры и цвета (SKU)</CardTitle>
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
            <Field label="Код SKU" className="min-w-[160px] flex-1">
              <Input {...register("skuCode")} placeholder={`${product.code}-M-PETROL`} />
            </Field>
            <Button type="submit" size="sm" loading={isSubmitting} className="sm:w-auto">
              Добавить SKU
            </Button>
          </form>
          {(errors.size ?? errors.color ?? errors.skuCode) && (
            <p className="text-[0.8rem] font-semibold text-destructive">Заполните размер, цвет и код SKU</p>
          )}

          {variantsLoading ? (
            <SkeletonList rows={2} />
          ) : (
            <ListCard
              items={variants}
              getKey={(row) => row.id}
              getIcon={() => "layers"}
              getTitle={(row) => `${row.size} / ${row.color}`}
              getMeta={(row) => row.skuCode}
              emptyTitle="Пока нет ни одного SKU"
              emptyHint="Добавьте размер и цвет в форме выше."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Спецификация (BOM)</CardTitle>
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
              Сохранить спецификацию черновиком
            </Button>
          )}

          <ListCard
            items={boms}
            getKey={(row) => row.id}
            getIcon={() => "file"}
            getTitle={(row) => `Версия ${row.version}`}
            getMeta={(row) => `${row.items.length} материалов`}
            getTrailing={(row) =>
              row.status === "draft" ? (
                <Button type="button" size="sm" loading={approvingBomId === row.id} onClick={() => void approveBom(row.id)}>
                  Утвердить
                </Button>
              ) : (
                <StatusBadge status={row.status} />
              )
            }
            emptyTitle="Спецификация ещё не создана"
            emptyHint="Добавьте материалы в форме выше."
          />
        </CardContent>
      </Card>
    </div>
  );
}
