import { useEffect, useState } from "react";
import {
  type MaterialResponseDto,
  type PurchaseOrderItemDraft,
  type PurchaseCurrency,
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
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { formatMoney, formatQuantity } from "../lib/format";
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

// Валюта закупки. Ткань обычно покупается за доллары, фурнитура — за сомы,
// но правило это не жёсткое, поэтому валюта выбирается руками и не выводится
// из типа материала (docs/PRINCIPLES.md, принцип 21).
const CURRENCIES: { value: PurchaseCurrency; label: string; hint: string }[] = [
  { value: "USD", label: "Доллары (USD)", hint: "обычно ткань" },
  { value: "KGS", label: "Сомы (KGS)", hint: "обычно фурнитура и упаковка" },
  { value: "RUB", label: "Рубли (RUB)", hint: "" },
];
const CURRENCY_SIGN: Record<PurchaseCurrency, string> = { USD: "$", KGS: "сом", RUB: "₽" };

export function PurchaseOrdersPage() {
  const { items: orders, isLoading, reload } = useCrudResource<PurchaseOrderResponseDto, never>("/purchase-orders");
  const [suppliers, setSuppliers] = useState<SupplierResponseDto[]>([]);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponseDto[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [currency, setCurrency] = useState<PurchaseCurrency>("USD");
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
      await apiRequest("/purchase-orders", { method: "POST", body: { supplierId, currency, items: lineItems } });
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

  // Сумма закупки — по её же позициям (количество × цена), теми же
  // данными, что уже пришли в списке. Новой метрики не вводится.
  const orderAmount = (row: PurchaseOrderResponseDto): number =>
    row.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);

  // Сумма подписывается валютой самой закупки. У закупок, созданных до
  // появления поля, валюта неизвестна — тогда сумма показывается без подписи,
  // а не подписывается наугад сомами.
  const orderAmountLabel = (row: PurchaseOrderResponseDto): string =>
    formatMoney(orderAmount(row), row.currency ?? "", 2);

  const visibleOrders = orders.filter((row) => statusFilter === "all" || row.status === statusFilter);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Закупки"
        subtitle={`${formatQuantity(orders.length, "заказов")} поставщикам`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Закупки" }]} />}
      />

      {referenceError ? (
        <ErrorState
          title="Не удалось загрузить справочники"
          description="Поставщики, материалы и склады недоступны — проверьте соединение."
          onRetry={loadReferences}
        />
      ) : (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Новая закупка</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start">
              <Field label="Поставщик" className="flex-1 md:max-w-[420px]">
                <Combobox
                  value={supplierId}
                  onChange={setSupplierId}
                  placeholder="Выберите поставщика"
                  searchPlaceholder="Поиск поставщика..."
                  options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
                />
              </Field>
              {/* Валюта указывается на закупку целиком: одна поставка — один
                  счёт в одной валюте. Именно она потом подписывает стоимость
                  материалов в партии, поэтому её нельзя угадывать. */}
              <Field
                label="Валюта закупки"
                className="md:w-[240px]"
                hint={<span className="t-meta">{CURRENCIES.find((row) => row.value === currency)?.hint}</span>}
              >
                <Select value={currency} onValueChange={(value) => setCurrency(value as PurchaseCurrency)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((row) => (
                      <SelectItem key={row.value} value={row.value}>
                        {row.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-muted/40 p-3.5 sm:flex-row sm:flex-wrap sm:items-end">
              <Field label="Материал" className="min-w-[160px] flex-1">
                <Combobox
                  value={pendingMaterialId}
                  onChange={setPendingMaterialId}
                  placeholder="Материал"
                  searchPlaceholder="Поиск материала..."
                  options={materials.map((material) => ({ value: material.id, label: material.name }))}
                />
              </Field>
              <Field label="Количество" className="min-w-[100px] flex-1">
                <NumberInput value={pendingQuantity} onChange={setPendingQuantity} min={0} decimals={3} />
              </Field>
              <Field label="Цена за единицу" className="min-w-[120px] flex-1">
                <MoneyInput value={pendingPrice} onChange={setPendingPrice} currency={CURRENCY_SIGN[currency]} />
              </Field>
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
              size="sm"
              className="md:self-start"
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

      <div className="mb-3 mt-5">
        <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />
      </div>

      {!isLoading && orders.length === 0 ? (
        <EmptyState
          compact
          title="Пока нет ни одной закупки"
          description="Создайте первую закупку в форме выше."
        />
      ) : !isLoading && visibleOrders.length === 0 ? (
        <EmptyState compact title="Ничего не найдено" description="Закупок с выбранным статусом нет." />
      ) : (
        <>
          {/* Таблица — планшет и десктоп, как в PurchasesScreen прототипа */}
          <div className="hidden md:block">
            <DataTable
              columns={[
                { key: "supplier", label: "Поставщик" },
                { key: "pos", label: "Позиции", width: "120px" },
                { key: "amount", label: "Сумма", align: "right", width: "150px" },
                { key: "status", label: "Статус", width: "230px" },
              ]}
            >
              {visibleOrders.map((row) => (
                <tr key={row.id} className="cursor-default">
                  <Td className="t-object">{supplierName(row.supplierId)}</Td>
                  <Td className="num text-muted-foreground">{formatQuantity(row.items.length)}</Td>
                  <Td align="right" className="t-amount">
                    {orderAmountLabel(row)}
                  </Td>
                  {/* Действия в колонке статуса — как на экране заказов пошива */}
                  <Td>
                    <div className="flex items-center gap-2">
                      {row.status === "draft" ? (
                        <Button
                          type="button"
                          size="sm"
                          loading={pendingOrderAction === row.id}
                          onClick={() => void confirmOrder(row.id)}
                        >
                          Подтвердить
                        </Button>
                      ) : row.status === "sent" ? (
                        <>
                          <Select
                            value={receiveWarehouse[row.id] ?? ""}
                            onValueChange={(value) => setReceiveWarehouse((prev) => ({ ...prev, [row.id]: value }))}
                          >
                            <SelectTrigger className="h-8 w-[104px]">
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
                          <Button
                            type="button"
                            size="sm"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void receiveOrder(row.id)}
                          >
                            Принять
                          </Button>
                        </>
                      ) : (
                        <StatusBadge status={row.status} />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </DataTable>
          </div>

          {/* Карточки — мобильная композиция прототипа */}
          <div className="space-y-2 md:hidden">
            {visibleOrders.map((row) => (
              <MobileListItem
                key={row.id}
                footer={
                  row.status === "draft" || row.status === "sent" ? (
                    <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                      {row.status === "draft" ? (
                        <Button
                          type="button"
                          size="sm"
                          loading={pendingOrderAction === row.id}
                          onClick={() => void confirmOrder(row.id)}
                        >
                          Подтвердить
                        </Button>
                      ) : (
                        <>
                          <Select
                            value={receiveWarehouse[row.id] ?? ""}
                            onValueChange={(value) => setReceiveWarehouse((prev) => ({ ...prev, [row.id]: value }))}
                          >
                            <SelectTrigger className="h-9 w-[120px]">
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
                          <Button
                            type="button"
                            size="sm"
                            loading={pendingOrderAction === row.id}
                            onClick={() => void receiveOrder(row.id)}
                          >
                            Принять
                          </Button>
                        </>
                      )}
                    </div>
                  ) : undefined
                }
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium">{supplierName(row.supplierId)}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {formatQuantity(row.items.length, "позиций")}
                    </div>
                  </div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="num mt-2.5 flex items-center justify-between border-t border-border pt-2 text-[12px]">
                  <span className="text-muted-foreground">Сумма</span>
                  <span className="t-amount">{orderAmountLabel(row)}</span>
                </div>
              </MobileListItem>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
