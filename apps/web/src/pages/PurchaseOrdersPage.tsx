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
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Combobox } from "../design-system/Select/Combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { NumberInput, MoneyInput } from "../design-system/Input/NumberInput";
import { Button } from "../design-system/Button/Button";
import { Avatar } from "../design-system/Avatar/Avatar";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyIllustration } from "../design-system/Feedback/EmptyIllustration";
import { toast } from "../design-system/Toast/Toast";

// Последний, седьмой из перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md,
// задача #72) — тот же паттерн, что уже утверждённая форма-эталон
// (ProductionOrdersPage): Combobox для поставщика/материала (растущий
// справочник), MoneyInput для цены (форматирование при blur).
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
  const [pendingQuantity, setPendingQuantity] = useState<number | undefined>(undefined);
  const [pendingPrice, setPendingPrice] = useState<number | undefined>(undefined);
  const [receiveWarehouse, setReceiveWarehouse] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingOrderAction, setPendingOrderAction] = useState<string | null>(null);
  const [referenceError, setReferenceError] = useState(false);

  const loadReferences = () => {
    setReferenceError(false);
    Promise.all([
      apiRequest<SupplierResponseDto[]>("/suppliers").then(setSuppliers),
      apiRequest<MaterialResponseDto[]>("/materials").then(setMaterials),
      apiRequest<WarehouseResponseDto[]>("/warehouses").then(setWarehouses),
    ]).catch(() => setReferenceError(true));
  };

  useEffect(() => {
    loadReferences();
  }, []);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.name ?? id;
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;

  const addLineItem = () => {
    if (!pendingMaterialId || !pendingQuantity || !pendingPrice) return;
    setLineItems((prev) => [...prev, { materialId: pendingMaterialId, quantity: pendingQuantity, unitPrice: pendingPrice }]);
    setPendingMaterialId("");
    setPendingQuantity(undefined);
    setPendingPrice(undefined);
  };

  const submitOrder = async () => {
    if (!supplierId || lineItems.length === 0) return;
    setIsSubmitting(true);
    try {
      await apiRequest("/purchase-orders", { method: "POST", body: { supplierId, items: lineItems } });
      setSupplierId("");
      setLineItems([]);
      await reload();
      toast.success("Закупка создана");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать закупку");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmOrder = async (orderId: string) => {
    setPendingOrderAction(orderId);
    try {
      await apiRequest(`/purchase-orders/${orderId}/confirm`, { method: "POST" });
      await reload();
      toast.success("Закупка подтверждена");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось подтвердить закупку");
    } finally {
      setPendingOrderAction(null);
    }
  };

  const receiveOrder = async (orderId: string) => {
    const warehouseId = receiveWarehouse[orderId];
    if (!warehouseId) {
      toast.error("Выберите склад для приёмки");
      return;
    }
    setPendingOrderAction(orderId);
    try {
      await apiRequest(`/purchase-orders/${orderId}/receive`, { method: "POST", body: { warehouseId } });
      await reload();
      toast.success("Закупка принята на склад");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось принять закупку");
    } finally {
      setPendingOrderAction(null);
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <h1>Закупки материалов</h1>

      {referenceError ? (
        <ErrorState
          title="Не удалось загрузить справочники"
          description="Поставщики, материалы и склады недоступны — проверьте соединение."
          onRetry={loadReferences}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Новая закупка</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Поставщик
              <Combobox
                value={supplierId}
                onChange={setSupplierId}
                placeholder="Выберите поставщика"
                searchPlaceholder="Поиск поставщика..."
                options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
              />
            </label>

            <div className="flex flex-col gap-3 rounded-[16px] bg-secondary p-3.5 sm:flex-row sm:items-end sm:flex-wrap">
              <label className="flex flex-1 min-w-[160px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                Материал
                <Combobox
                  value={pendingMaterialId}
                  onChange={setPendingMaterialId}
                  placeholder="Материал"
                  searchPlaceholder="Поиск материала..."
                  options={materials.map((material) => ({ value: material.id, label: material.name }))}
                />
              </label>
              <label className="flex flex-1 min-w-[100px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                Количество
                <NumberInput value={pendingQuantity} onChange={setPendingQuantity} min={0} decimals={3} />
              </label>
              <label className="flex flex-1 min-w-[120px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
                Цена за единицу
                <MoneyInput value={pendingPrice} onChange={setPendingPrice} currency="сом" />
              </label>
              <Button type="button" variant="secondary" size="sm" onClick={addLineItem} className="sm:w-auto">
                Добавить строку
              </Button>
            </div>

            {lineItems.length > 0 && (
              <ul className="m-0 list-none p-0 text-[0.9rem] text-muted-foreground">
                {lineItems.map((item, index) => (
                  <li key={index} className="flex justify-between border-b border-border py-1.5 last:border-none">
                    <span>{materialName(item.materialId)}</span>
                    <span className="tabular-nums">
                      {item.quantity} × {item.unitPrice}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="button"
              loading={isSubmitting}
              disabled={!supplierId || lineItems.length === 0}
              onClick={() => void submitOrder()}
            >
              {isSubmitting ? "Создаём..." : "Создать закупку"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading && <SkeletonList />}

      <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      <div>
        {orders
          .filter((row) => statusFilter === "all" || row.status === statusFilter)
          .map((row) => (
            <Card key={row.id} interactive className="mb-2.5 flex flex-wrap items-center gap-3 p-3.5">
              <Avatar tone="info">{supplierName(row.supplierId).slice(0, 2).toUpperCase()}</Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-foreground">{supplierName(row.supplierId)}</div>
                <div className="truncate text-[11.5px] text-muted-foreground">{row.items.length} позиций</div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {row.status === "draft" && (
                  <Button type="button" size="sm" loading={pendingOrderAction === row.id} onClick={() => void confirmOrder(row.id)}>
                    Подтвердить
                  </Button>
                )}
                {row.status === "sent" && (
                  <div className="flex items-center gap-2">
                    <Select
                      value={receiveWarehouse[row.id] ?? ""}
                      onValueChange={(value) => setReceiveWarehouse((prev) => ({ ...prev, [row.id]: value }))}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Склад" />
                      </SelectTrigger>
                      <SelectContent>
                        {warehouses.map((warehouse) => (
                          <SelectItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" loading={pendingOrderAction === row.id} onClick={() => void receiveOrder(row.id)}>
                      Принять
                    </Button>
                  </div>
                )}
                {row.status === "received" && <StatusBadge status={row.status} />}
              </div>
            </Card>
          ))}
        {!isLoading && orders.length === 0 && (
          <div className="card empty flex flex-col items-center gap-1">
            <EmptyIllustration className="mb-1 h-16 w-auto" />
            <div className="t">Пока нет ни одной закупки</div>
            <div className="s">Создайте первую закупку в форме выше.</div>
          </div>
        )}
      </div>
    </section>
  );
}
