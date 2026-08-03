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
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Button } from "../design-system/Button/Button";
import { Input } from "../design-system/Input/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { DatePicker } from "../design-system/Form/DatePicker";
import { Avatar } from "../design-system/Avatar/Avatar";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { toast } from "../design-system/Toast/Toast";

// Форма-эталон (docs/UI_FOUNDATION.md, шаг 5) — первый экран, полностью
// собранный из GarmentInput/GarmentSelect/GarmentDatePicker/GarmentButton/
// GarmentCard вместо голого HTML. После утверждения владельцем — образец
// для переноса остальных 7 форм (не переносятся в этом же цикле работ).
const STATUS_FILTERS: FilterOption<"all" | "draft" | "placed" | "in_progress" | "ready_for_pickup" | "received">[] = [
  { value: "all", label: "Все" },
  { value: "draft", label: "Черновик" },
  { value: "placed", label: "Размещён" },
  { value: "in_progress", label: "В работе" },
  { value: "ready_for_pickup", label: "Готово" },
  { value: "received", label: "Принято" },
];

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
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [lines, setLines] = useState<ProductionOrderVariantDraft[]>([]);
  const [pendingVariantId, setPendingVariantId] = useState("");
  const [pendingQuantity, setPendingQuantity] = useState("");
  const [receiveWarehouse, setReceiveWarehouse] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");

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
    try {
      await apiRequest("/production-orders", {
        method: "POST",
        body: {
          productId,
          bomId: approvedBom.id,
          workshopId,
          plannedQuantity: totalQuantity,
          agreedUnitPrice: Number(unitPrice),
          dueDate: dueDate ? dueDate.toISOString().slice(0, 10) : undefined,
          variants: lines,
        },
      });
      setProductId("");
      setWorkshopId("");
      setUnitPrice("");
      setDueDate(undefined);
      setLines([]);
      await reload();
      toast.success("Заказ пошива создан", { description: "Черновик добавлен в список ниже" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать заказ пошива");
    }
  };

  const confirmOrder = async (orderId: string) => {
    try {
      await apiRequest(`/production-orders/${orderId}/confirm`, { method: "POST" });
      await reload();
      toast.success("Заказ подтверждён");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось подтвердить заказ");
    }
  };

  const receiveOrder = async (orderId: string) => {
    const warehouseId = receiveWarehouse[orderId];
    if (!warehouseId) {
      toast.error("Выберите склад для приёмки");
      return;
    }
    try {
      await apiRequest(`/production-orders/${orderId}/receive`, { method: "POST", body: { warehouseId } });
      await reload();
      toast.success("Партия принята на склад");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось принять партию");
    }
  };

  return (
    <section className="flex flex-col gap-5">
      <h1>Заказы пошива</h1>

      <Card>
        <CardHeader>
          <CardTitle>Новый заказ пошива</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
            Модель
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите модель" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {productId && !approvedBom && (
            <p className="text-[0.85rem] font-semibold text-destructive">
              У этой модели нет утверждённой спецификации (BOM) — сначала утвердите её на карточке модели.
            </p>
          )}

          <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
            Цех
            <Select value={workshopId} onValueChange={setWorkshopId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите цех" />
              </SelectTrigger>
              <SelectContent>
                {workshops.map((workshop) => (
                  <SelectItem key={workshop.id} value={workshop.id}>
                    {workshop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
            Цена пошива за единицу
            <Input type="number" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} />
          </label>

          <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
            Срок сдачи
            <DatePicker value={dueDate} onChange={setDueDate} />
          </label>

          <div className="flex flex-col gap-3 rounded-[16px] bg-secondary p-3.5 sm:flex-row sm:items-end sm:flex-wrap">
            <label className="flex flex-1 min-w-[140px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              SKU
              <Select value={pendingVariantId} onValueChange={setPendingVariantId} disabled={!productId}>
                <SelectTrigger>
                  <SelectValue placeholder="Размер / цвет" />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id}>
                      {variant.size} / {variant.color}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="flex flex-1 min-w-[100px] flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Количество
              <Input type="number" value={pendingQuantity} onChange={(event) => setPendingQuantity(event.target.value)} />
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              Добавить строку
            </Button>
          </div>

          {lines.length > 0 && (
            <ul className="m-0 list-none p-0 text-[0.9rem] text-muted-foreground">
              {lines.map((line, index) => (
                <li key={index} className="border-b border-border py-1.5 last:border-none">
                  {variantLabel(line.productVariantId)} — {line.quantity} шт
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            disabled={!productId || !workshopId || !approvedBom || !unitPrice || lines.length === 0}
            onClick={() => void submitOrder()}
          >
            Создать заказ пошива
          </Button>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}

      <FilterTabs options={STATUS_FILTERS} value={statusFilter} onChange={setStatusFilter} />

      <div>
        {orders
          .filter((row) => statusFilter === "all" || row.status === statusFilter)
          .map((row) => (
            <Card key={row.id} className="mb-2.5 flex flex-wrap items-center gap-3 p-3.5">
              <Avatar tone="warning">{productName(row.productId).slice(0, 2).toUpperCase()}</Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-foreground">{productName(row.productId)}</div>
                <div className="truncate text-[11.5px] text-muted-foreground">
                  {workshopName(row.workshopId)} · {row.plannedQuantity} шт
                </div>
              </div>
              <div className="flex flex-none items-center gap-2">
                {row.status === "draft" && (
                  <Button type="button" size="sm" onClick={() => void confirmOrder(row.id)}>
                    Подтвердить
                  </Button>
                )}
                {row.status === "ready_for_pickup" && (
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
                    <Button type="button" size="sm" onClick={() => void receiveOrder(row.id)}>
                      Принять партию
                    </Button>
                  </div>
                )}
                {(row.status === "placed" || row.status === "in_progress" || row.status === "received") && (
                  <StatusBadge status={row.status} />
                )}
              </div>
            </Card>
          ))}
        {!isLoading && orders.length === 0 && (
          <div className="card empty">
            <div className="t">Пока нет ни одного заказа пошива</div>
            <div className="s">Создайте первый заказ в форме выше.</div>
          </div>
        )}
      </div>
    </section>
  );
}
