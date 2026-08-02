import { useEffect, useState } from "react";
import {
  type MaterialResponseDto,
  type PurchaseOrderItemDraft,
  type PurchaseOrderResponseDto,
  type SupplierResponseDto,
  type WarehouseResponseDto,
} from "@garmentos/shared-types";
import { apiRequest, ApiError } from "../api/client";
import { useCrudResource } from "../api/useCrudResource";
import { FilterTabs, type FilterOption } from "../components/FilterTabs";
import { StatusBadge } from "../components/StatusBadge";

const STATUS_FILTERS: FilterOption<"all" | "draft" | "sent" | "received">[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновик" },
  { value: "sent", label: "Отправлено" },
  { value: "received", label: "Получено" },
];

export function PurchaseOrdersPage() {
  const { items: orders, isLoading, reload } = useCrudResource<PurchaseOrderResponseDto, never>("/purchase-orders");
  const [suppliers, setSuppliers] = useState<SupplierResponseDto[]>([]);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponseDto[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [lineItems, setLineItems] = useState<PurchaseOrderItemDraft[]>([]);
  const [pendingMaterialId, setPendingMaterialId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState("");
  const [pendingPrice, setPendingPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [receiveWarehouse, setReceiveWarehouse] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");

  useEffect(() => {
    void apiRequest<SupplierResponseDto[]>("/suppliers").then(setSuppliers);
    void apiRequest<MaterialResponseDto[]>("/materials").then(setMaterials);
    void apiRequest<WarehouseResponseDto[]>("/warehouses").then(setWarehouses);
  }, []);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const addLineItem = () => {
    if (!pendingMaterialId || !pendingQuantity || !pendingPrice) return;
    setLineItems((prev) => [
      ...prev,
      { materialId: pendingMaterialId, quantity: Number(pendingQuantity), unitPrice: Number(pendingPrice) },
    ]);
    setPendingMaterialId("");
    setPendingQuantity("");
    setPendingPrice("");
  };

  const submitOrder = async () => {
    if (!supplierId || lineItems.length === 0) return;
    setError(null);
    try {
      await apiRequest("/purchase-orders", { method: "POST", body: { supplierId, items: lineItems } });
      setSupplierId("");
      setLineItems([]);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось создать закупку");
    }
  };

  const confirmOrder = async (orderId: string) => {
    setError(null);
    try {
      await apiRequest(`/purchase-orders/${orderId}/confirm`, { method: "POST" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось подтвердить закупку");
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
      await apiRequest(`/purchase-orders/${orderId}/receive`, { method: "POST", body: { warehouseId } });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось принять закупку");
    }
  };

  return (
    <section>
      <h1>Закупки материалов</h1>

      <div className="entity-form">
        <label>
          Поставщик
          <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
            <option value="">Выберите поставщика</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <div className="entity-form inline">
          <label>
            Материал
            <select value={pendingMaterialId} onChange={(event) => setPendingMaterialId(event.target.value)}>
              <option value="">Материал</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Количество
            <input type="number" step="0.001" value={pendingQuantity} onChange={(event) => setPendingQuantity(event.target.value)} />
          </label>
          <label>
            Цена за единицу
            <input type="number" step="0.01" value={pendingPrice} onChange={(event) => setPendingPrice(event.target.value)} />
          </label>
          <button type="button" onClick={addLineItem}>
            Добавить строку
          </button>
        </div>

        {lineItems.length > 0 && (
          <ul className="pending-list">
            {lineItems.map((item, index) => (
              <li key={index}>
                {materialName(item.materialId)} — {item.quantity} × {item.unitPrice}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="form-error">{error}</p>}
        <button type="button" disabled={!supplierId || lineItems.length === 0} onClick={() => void submitOrder()}>
          Создать закупку
        </button>
      </div>

      {isLoading && <p>Загрузка…</p>}

      <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      <div>
        {orders
          .filter((row) => statusFilter === "all" || row.status === statusFilter)
          .map((row) => (
            <div key={row.id} className="card list-card" style={{ flexWrap: "wrap" }}>
              <span className="thumb" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
                {supplierName(row.supplierId).slice(0, 2).toUpperCase()}
              </span>
              <span className="body">
                <span className="title">{supplierName(row.supplierId)}</span>
                <span className="meta">{row.items.length} позиций</span>
              </span>
              <span className="actions">
                {row.status === "draft" && (
                  <button type="button" onClick={() => void confirmOrder(row.id)}>
                    Подтвердить
                  </button>
                )}
                {row.status === "sent" && (
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
                      Принять
                    </button>
                  </div>
                )}
                {row.status === "received" && <StatusBadge status={row.status} />}
              </span>
            </div>
          ))}
        {orders.length === 0 && (
          <div className="card empty">
            <div className="t">Пока нет ни одной закупки</div>
            <div className="s">Создайте первую закупку в форме выше.</div>
          </div>
        )}
      </div>
    </section>
  );
}
