import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createWarehouseSchema,
  type CreateWarehouseDto,
  type MaterialResponseDto,
  type MaterialStockItemResponseDto,
  type WarehouseResponseDto,
} from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { apiRequest, ApiError } from "../api/client";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { formatQuantity } from "../lib/format";
import { SearchBar } from "../design-system/Search/SearchBar";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../design-system/Modal/Dialog";

// Четвёртый из 7 перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md, задача #72).
export function WarehousesPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<WarehouseResponseDto, CreateWarehouseDto>(
    "/warehouses",
  );
  const [query, setQuery] = useState("");
  // Остатки материалов по складу (P0-3, владелец проекта, 2026-09-07).
  const [stockWarehouse, setStockWarehouse] = useState<WarehouseResponseDto | null>(null);
  const [stockItems, setStockItems] = useState<MaterialStockItemResponseDto[]>([]);
  const [materials, setMaterials] = useState<MaterialResponseDto[]>([]);
  const [isStockLoading, setIsStockLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateWarehouseDto>({ resolver: zodResolver(createWarehouseSchema) });

  const onSubmit = async (data: CreateWarehouseDto) => {
    try {
      await create(data);
      reset();
      toast.success("Склад добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать склад");
    }
  };

  // Тип склада приходит из API кодом (warehouseTypeSchema) — подписываем
  // по-русски, само значение не меняется.
  const TYPE_LABEL: Record<string, string> = {
    own: "Свой",
    workshop: "У цеха",
    marketplace_fbo: "FBO маркетплейса",
    consignment: "Комиссионный",
  };

  const openStock = async (warehouse: WarehouseResponseDto) => {
    setStockWarehouse(warehouse);
    setIsStockLoading(true);
    try {
      const [stock, materialsList] = await Promise.all([
        apiRequest<MaterialStockItemResponseDto[]>(`/warehouses/${warehouse.id}/material-stock`),
        apiRequest<MaterialResponseDto[]>("/materials"),
      ]);
      setStockItems(stock);
      setMaterials(materialsList);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось загрузить остатки материалов");
      setStockItems([]);
    } finally {
      setIsStockLoading(false);
    }
  };
  const materialName = (materialId: string) => materials.find((m) => m.id === materialId)?.name ?? materialId;
  const materialUnit = (materialId: string) => materials.find((m) => m.id === materialId)?.unit ?? "";

  const visibleWarehouses = items.filter((row) =>
    row.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Склады"
        subtitle={`${formatQuantity(items.length, "складов")} в справочнике`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Склады" }]} />}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Новый склад</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Название" error={errors.name?.message}>
                <Input {...register("name")} placeholder="Основной склад" />
              </Field>
              <Field label="Страна">
                <Input {...register("country")} placeholder="Киргизия" />
              </Field>
            </div>

            <Button type="submit" size="sm" loading={isSubmitting} className="md:self-start">
              {isSubmitting ? "Добавляем..." : "Добавить склад"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить склады" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Поиск склада"
            className="mb-3 md:w-[340px]"
          />

          {visibleWarehouses.length === 0 ? (
            <EmptyState
              compact
              title={items.length === 0 ? "Пока нет ни одного склада" : "Ничего не найдено"}
              description={
                items.length === 0
                  ? "Добавьте первый склад — займёт меньше минуты."
                  : "По заданному запросу складов нет."
              }
              action={
                items.length === 0 ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setFocus("name")}>
                    Добавить склад
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden md:block">
                <DataTable
                  columns={[
                    { key: "name", label: "Название" },
                    { key: "type", label: "Тип", width: "190px" },
                    { key: "country", label: "Страна", align: "right", width: "140px" },
                    { key: "stock", label: "", width: "120px" },
                  ]}
                >
                  {visibleWarehouses.map((row) => (
                    <tr key={row.id} className="cursor-default">
                      <Td className="t-object">{row.name}</Td>
                      <Td className="text-muted-foreground">{TYPE_LABEL[row.type] ?? row.type}</Td>
                      <Td align="right" className="text-muted-foreground">
                        {row.country ?? "—"}
                      </Td>
                      <Td align="right">
                        <Button type="button" size="sm" variant="secondary" onClick={() => void openStock(row)}>
                          Остатки
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </DataTable>
              </div>

              <div className="space-y-2 md:hidden">
                {visibleWarehouses.map((row) => (
                  <MobileListItem key={row.id}>
                    <div className="text-[13px] font-medium">{row.name}</div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[12px] text-muted-foreground">
                      <span>{TYPE_LABEL[row.type] ?? row.type}</span>
                      <span>{row.country ?? "—"}</span>
                    </div>
                    <Button type="button" size="sm" variant="secondary" className="mt-2 w-full" onClick={() => void openStock(row)}>
                      Остатки материалов
                    </Button>
                  </MobileListItem>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Остатки материалов по складу (P0-3) — source of truth,
          material_stock_items, без нового агрегата/таблицы. */}
      <Dialog open={stockWarehouse !== null} onOpenChange={(open) => (!open ? setStockWarehouse(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Остатки материалов — {stockWarehouse?.name}</DialogTitle>
          </DialogHeader>
          {isStockLoading ? (
            <SkeletonList rows={3} />
          ) : stockItems.length === 0 ? (
            <EmptyState compact title="На складе нет остатков материалов" description="Остаток появится после приёмки закупки." />
          ) : (
            <ul className="divide-y divide-border rounded-[10px] border border-border px-3">
              {stockItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                  <span>{materialName(item.materialId)}</span>
                  <span className="num font-medium">
                    {formatQuantity(Number(item.quantityOnHand), materialUnit(item.materialId))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
