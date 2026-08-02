import { useEffect, useState } from "react";
import {
  type BomResponseDto,
  type ProductResponseDto,
  type ProductVariantResponseDto,
  type ProductionOrderResponseDto,
  type ProductionOrderVariantDraft,
  type WarehouseResponseDto,
  type WorkshopResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable } from "../components/DataTable";

export function ProductionOrdersPage() {
  const { items: orders, isLoading, reload } = useCrudResource<ProductionOrderResponseDto, never>("/production-orders");
  const [products, setProducts] = useState<ProductResponseDto[]>([]);
  const [workshops, setWorkshops] = useState<WorkshopResponseDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponseDto[]>([]);
  const [variants, setVariants] = useState<ProductVariantResponseDto[]>([]);
  const [approvedBom, setApprovedBom] = useState<BomResponseDto | null>(null);

  const [productId, setProductId] = useState("");
  const [workshopId, setWorkshopId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState<ProductionOrderVariantDraft[]>([]);
  const [pendingVariantId, setPendingVariantId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receiveWarehouse, setReceiveWarehouse] = useState<Record<string, string>>({});

  useEffect(() => {
    void apiRequest<ProductResponseDto[]>("/products").then(setProducts);
    void apiRequest<WorkshopResponseDto[]>("/workshops").then(setWorkshops);
    void apiRequest<WarehouseResponseDto[]>("/warehouses").then(setWarehouses);
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

  const addLine = () => {
    if (!pendingVariantId || !pendingQuantity) return;
    setLines((prev) => [...prev, { productVariantId: pendingVariantId, quantity: Number(pendingQuantity) }]);
    setPendingVariantId("");
    setPendingQuantity("");
  };

  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);

  const submitOrder = async () => {
    if (!productId || !workshopId || !approvedBom || !unitPrice || lines.length === 0) return;
    setError(null);
    try {
      await apiRequest("/production-orders", {
        method: "POST",
        body: {
          productId,
          bomId: approvedBom.id,
          workshopId,
          plannedQuantity: totalQuantity,
          agreedUnitPrice: Number(unitPrice),
          dueDate: dueDate || undefined,
          variants: lines,
        },
      });
      setProductId("");
      setWorkshopId("");
      setUnitPrice("");
      setDueDate("");
      setLines([]);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать заказ пошива");
    }
  };

  const confirmOrder = async (orderId: string) => {
    setError(null);
    try {
      await apiRequest(`/production-orders/${orderId}/confirm`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось подтвердить заказ");
    }
  };

  const receiveOrder = async (orderId: string) => {
    const warehouseId = receiveWarehouse[orderId];
    if (!warehouseId) {
      setError("Выберите склад для приёмки");
      return;
    }
    setError(null);
    try {
      await apiRequest(`/production-orders/${orderId}/receive`, { method: "POST", body: { warehouseId } });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось принять партию");
    }
  };

  return (
    <section>
      <h1>Заказы пошива</h1>

      <div className="entity-form">
        <label>
          Модель
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">Выберите модель</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </label>

        {productId && !approvedBom && (
          <p className="form-error">У этой модели нет утверждённой спецификации (BOM) — сначала утвердите её на карточке модели.</p>
        )}

        <label>
          Цех
          <select value={workshopId} onChange={(event) => setWorkshopId(event.target.value)}>
            <option value="">Выберите цех</option>
            {workshops.map((workshop) => (
              <option key={workshop.id} value={workshop.id}>
                {workshop.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Цена пошива за единицу
          <input type="number" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
        </label>

        <label>
          Срок сдачи
          <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        </label>

        <div className="entity-form inline">
          <label>
            SKU
            <select value={pendingVariantId} onChange={(event) => setPendingVariantId(event.target.value)} disabled={!productId}>
              <option value="">Размер / цвет</option>
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.size} / {variant.color}
                </option>
              ))}
            </select>
          </label>
          <label>
            Количество
            <input type="number" value={pendingQuantity} onChange={(event) => setPendingQuantity(event.target.value)} />
          </label>
          <button type="button" onClick={addLine}>
            Добавить строку
          </button>
        </div>

        {lines.length > 0 && (
          <ul className="pending-list">
            {lines.map((line, index) => (
              <li key={index}>
                {variantLabel(line.productVariantId)} — {line.quantity} шт
              </li>
            ))}
          </ul>
        )}

        {error && <p className="form-error">{error}</p>}
        <button
          type="button"
          disabled={!productId || !workshopId || !approvedBom || !unitPrice || lines.length === 0}
          onClick={() => void submitOrder()}
        >
          Создать заказ пошива
        </button>
      </div>

      {isLoading && <p>Загрузка…</p>}

      <DataTable
        rows={orders}
        rowKey={(row) => row.id}
        emptyText="Пока нет ни одного заказа пошива"
        columns={[
          { header: "Модель", render: (row) => productName(row.productId) },
          { header: "Цех", render: (row) => workshopName(row.workshopId) },
          { header: "Количество", render: (row) => row.plannedQuantity },
          { header: "Статус", render: (row) => row.status },
          {
            header: "Действие",
            render: (row) => {
              if (row.status === "draft") {
                return (
                  <button type="button" onClick={() => void confirmOrder(row.id)}>
                    Подтвердить
                  </button>
                );
              }
              if (row.status === "ready_for_pickup") {
                return (
                  <div className="inline-action">
                    <select
                      value={receiveWarehouse[row.id] ?? ""}
                      onChange={(event) => setReceiveWarehouse((prev) => ({ ...prev, [row.id]: event.target.value }))}
                    >
                      <option value="">Склад</option>
                      {warehouses.map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => void receiveOrder(row.id)}>
                      Принять партию
                    </button>
                  </div>
                );
              }
              return null;
            },
          },
        ]}
      />
    </section>
  );
}
