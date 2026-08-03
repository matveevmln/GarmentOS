import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<ProductResponseDto | null>(null);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [boms, setBoms] = useState<BomResponseDto[]>([]);
  const [bomItems, setBomItems] = useState<BomItemDraft[]>([]);
  const [bomError, setBomError] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [pendingMaterialId, setPendingMaterialId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState("");
  const [pendingWaste, setPendingWaste] = useState("");

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

  useEffect(() => {
    if (!id) return;
    void apiRequest<ProductResponseDto>(`/products/${id}`).then(setProduct);
    void apiRequest<MaterialResponseDto[]>("/materials").then(setMaterials);
    void reloadBoms();
  }, [id]);

  const onSubmitVariant = async (data: Omit<CreateProductVariantDto, "productId">) => {
    if (!id) return;
    setVariantError(null);
    try {
      await createVariant({ ...data, productId: id });
      reset();
    } catch (err) {
      setVariantError(err instanceof ApiError ? err.message : "Не удалось добавить SKU");
    }
  };

  const addBomItem = () => {
    if (!pendingMaterialId || !pendingQuantity) return;
    setBomItems((prev) => [
      ...prev,
      {
        materialId: pendingMaterialId,
        quantityPerUnit: Number(pendingQuantity),
        wastePercent: pendingWaste ? Number(pendingWaste) : undefined,
      },
    ]);
    setPendingMaterialId("");
    setPendingQuantity("");
    setPendingWaste("");
  };

  const submitBom = async () => {
    if (!id || bomItems.length === 0) return;
    setBomError(null);
    try {
      await apiRequest(`/boms`, { method: "POST", body: { productId: id, items: bomItems } });
      setBomItems([]);
      await reloadBoms();
    } catch (err) {
      setBomError(err instanceof ApiError ? err.message : "Не удалось создать спецификацию (BOM)");
    }
  };

  const approveBom = async (bomId: string) => {
    setBomError(null);
    try {
      await apiRequest(`/boms/${bomId}/approve`, { method: "POST" });
      await reloadBoms();
    } catch (err) {
      setBomError(err instanceof ApiError ? err.message : "Не удалось утвердить спецификацию");
    }
  };

  if (!product) return <p>Загрузка…</p>;

  return (
    <section>
      <h1>{product.name}</h1>
      <p className="muted">
        Артикул {product.code} · <StatusBadge status={product.status} />
      </p>

      <h2>Размеры и цвета (SKU)</h2>
      <form className="entity-form inline" onSubmit={(event) => void handleSubmit(onSubmitVariant)(event)}>
        <label>
          Размер
          <input {...register("size")} placeholder="M" />
        </label>
        <label>
          Цвет
          <input {...register("color")} placeholder="Петроль" />
        </label>
        <label>
          Код SKU
          <input {...register("skuCode")} placeholder={`${product.code}-M-PETROL`} />
        </label>
        {(errors.size ?? errors.color ?? errors.skuCode) && (
          <p className="field-error">Заполните размер, цвет и код SKU</p>
        )}
        <button type="submit" disabled={isSubmitting}>
          Добавить SKU
        </button>
      </form>
      {variantError && <p className="form-error">{variantError}</p>}
      {variantsLoading && <p>Загрузка…</p>}
      <ListCard
        items={variants}
        getKey={(row) => row.id}
        getIcon={() => "layers"}
        getTitle={(row) => `${row.size} / ${row.color}`}
        getMeta={(row) => row.skuCode}
        emptyTitle="Пока нет ни одного SKU"
        emptyHint="Добавьте размер и цвет в форме выше."
      />

      <h2>Спецификация (BOM)</h2>
      <div className="entity-form inline">
        <label>
          Материал
          <select value={pendingMaterialId} onChange={(event) => setPendingMaterialId(event.target.value)}>
            <option value="">Выберите материал</option>
            {materials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Расход на единицу
          <input
            type="number"
            step="0.001"
            value={pendingQuantity}
            onChange={(event) => setPendingQuantity(event.target.value)}
          />
        </label>
        <label>
          Отходы, %
          <input type="number" step="0.1" value={pendingWaste} onChange={(event) => setPendingWaste(event.target.value)} />
        </label>
        <button type="button" onClick={addBomItem}>
          Добавить строку
        </button>
      </div>

      {bomItems.length > 0 && (
        <ul className="pending-list">
          {bomItems.map((item, index) => (
            <li key={index}>
              {materials.find((m) => m.id === item.materialId)?.name ?? item.materialId} — {item.quantityPerUnit}
              {item.wastePercent ? ` (+${item.wastePercent}% отходы)` : ""}
            </li>
          ))}
        </ul>
      )}
      {bomItems.length > 0 && (
        <button type="button" onClick={() => void submitBom()}>
          Сохранить спецификацию черновиком
        </button>
      )}
      {bomError && <p className="form-error">{bomError}</p>}

      <ListCard
        items={boms}
        getKey={(row) => row.id}
        getIcon={() => "file"}
        getTitle={(row) => `Версия ${row.version}`}
        getMeta={(row) => `${row.items.length} материалов`}
        getTrailing={(row) =>
          row.status === "draft" ? (
            <button type="button" onClick={() => void approveBom(row.id)}>
              Утвердить
            </button>
          ) : (
            <StatusBadge status={row.status} />
          )
        }
        emptyTitle="Спецификация ещё не создана"
        emptyHint="Добавьте материалы в форме выше."
      />
    </section>
  );
}
