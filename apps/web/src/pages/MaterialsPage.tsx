import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createMaterialSchema, type CreateMaterialDto, type MaterialResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { DataTable, Td, MobileListItem } from "../design-system/Blocks";
import { Field } from "../design-system/Form/Field";
import { PageHeader, Breadcrumbs } from "../design-system/PageHeader/PageHeader";
import { EmptyState } from "../design-system/Feedback/EmptyState";
import { formatQuantity, unitLabel } from "../lib/format";
import { FilterTabs, type FilterOption } from "../design-system/Tabs/FilterTabs";
import { SearchBar } from "../design-system/Search/SearchBar";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Input } from "../design-system/Input/Input";
import { NumberInput } from "../design-system/Input/NumberInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { Button } from "../design-system/Button/Button";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { toast } from "../design-system/Toast/Toast";
import { ApiError } from "../api/client";

// Третий из 7 перенесённых экранов (docs/DESIGN_SYSTEM_MAP.md, задача #72).
// «Точка перезаказа» — NumberInput с суффиксом, который следует за
// выбранной единицей измерения (watch("unit")): раньше единица была видна
// только в отдельном select rядом, здесь — прямо у значения, где реально
// нужна для понимания числа.
const MATERIAL_TYPES = [
  { value: "fabric", label: "Ткани" },
  { value: "trim", label: "Фурнитура" },
  { value: "packaging", label: "Упаковка" },
  { value: "accessory", label: "Прочее" },
] as const;
const MATERIAL_UNITS = [
  { value: "m", label: "м (метры)" },
  { value: "kg", label: "кг (килограммы)" },
  { value: "pcs", label: "шт (штуки)" },
] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  MATERIAL_TYPES.map((type) => [type.value, type.label]),
);

const TYPE_FILTERS: FilterOption<"all" | (typeof MATERIAL_TYPES)[number]["value"]>[] = [
  { value: "all", label: "Все" },
  ...MATERIAL_TYPES.map((type) => ({ value: type.value, label: type.label })),
];

export function MaterialsPage() {
  const { items, isLoading, error, reload, create } = useCrudResource<MaterialResponseDto, CreateMaterialDto>(
    "/materials",
  );
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["value"]>("all");
  const [query, setQuery] = useState("");
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<CreateMaterialDto>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: { type: "fabric", unit: "m" },
  });
  const selectedUnit = watch("unit");

  // Фильтрация по уже загруженному списку — без обращений к API.
  const visibleMaterials = items
    .filter((row) => typeFilter === "all" || row.type === typeFilter)
    .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));

  const onSubmit = async (data: CreateMaterialDto) => {
    try {
      await create(data);
      reset({ type: "fabric", unit: "m" });
      toast.success("Материал добавлен");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Не удалось создать материал");
    }
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Материалы"
        subtitle={`${formatQuantity(items.length, "позиций")} в справочнике`}
        breadcrumbs={<Breadcrumbs items={[{ label: "GarmentOS" }, { label: "Материалы" }]} />}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Новый материал</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Название" error={errors.name?.message}>
              <Input {...register("name")} placeholder="Трикотаж «Петроль»" />
            </Field>

            <Field label="Тип">
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Единица измерения">
              <Controller
                name="unit"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MATERIAL_UNITS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field label="Точка перезаказа">
              <Controller
                name="reorderPoint"
                control={control}
                render={({ field }) => (
                  <NumberInput value={field.value} onChange={field.onChange} min={0} decimals={3} suffix={selectedUnit} />
                )}
              />
            </Field>
            </div>

            <Button type="submit" size="sm" loading={isSubmitting} className="md:self-start">
              {isSubmitting ? "Добавляем..." : "Добавить материал"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isLoading && <SkeletonList />}
      {!isLoading && error && (
        <ErrorState title="Не удалось загрузить материалы" description={error} onRetry={() => void reload()} />
      )}

      {!isLoading && !error && (
        <>
          <div className="mb-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
            <SearchBar value={query} onChange={setQuery} placeholder="Поиск материала" className="md:w-[340px]" />
            <FilterTabs options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
          </div>

          {visibleMaterials.length === 0 ? (
            <EmptyState
              compact
              title={items.length === 0 ? "Пока нет ни одного материала" : "Ничего не найдено"}
              description={
                items.length === 0
                  ? "Добавьте первый материал — займёт меньше минуты."
                  : "По заданным условиям поиска и фильтрам материалов нет."
              }
              action={
                items.length === 0 ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => setFocus("name")}>
                    Добавить материал
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Таблица — планшет и десктоп, как в MaterialsScreen прототипа */}
              <div className="hidden md:block">
                <DataTable
                  columns={[
                    { key: "name", label: "Наименование" },
                    { key: "kind", label: "Тип", width: "150px" },
                    { key: "unit", label: "Ед.", width: "80px" },
                    { key: "reorder", label: "Точка перезаказа", align: "right", width: "170px" },
                  ]}
                >
                  {visibleMaterials.map((row) => (
                    <tr key={row.id} className="cursor-default">
                      <Td className="t-object">{row.name}</Td>
                      <Td className="text-muted-foreground">{TYPE_LABEL[row.type] ?? row.type}</Td>
                      <Td className="num text-muted-foreground">{unitLabel(row.unit)}</Td>
                      <Td align="right" className="num text-muted-foreground">
                        {row.reorderPoint ? formatQuantity(Number(row.reorderPoint), unitLabel(row.unit), 3) : "—"}
                      </Td>
                    </tr>
                  ))}
                </DataTable>
              </div>

              {/* Карточки — мобильная композиция прототипа */}
              <div className="space-y-2 md:hidden">
                {visibleMaterials.map((row) => (
                  <MobileListItem key={row.id}>
                    <div className="text-[13px] font-medium">{row.name}</div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[12px] text-muted-foreground">
                      <span>
                        {TYPE_LABEL[row.type] ?? row.type} · {unitLabel(row.unit)}
                      </span>
                      <span className="num">
                        {row.reorderPoint ? formatQuantity(Number(row.reorderPoint), unitLabel(row.unit), 3) : "—"}
                      </span>
                    </div>
                  </MobileListItem>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
