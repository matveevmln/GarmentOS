import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createMaterialSchema, type CreateMaterialDto, type MaterialResponseDto } from "@garmentos/shared-types";
import { useCrudResource } from "../api/useCrudResource";
import { ListCard } from "../design-system/ListCard/ListCard";
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
const MATERIAL_ICONS: Record<string, string> = {
  fabric: "box",
  trim: "scissors",
  packaging: "layers",
  accessory: "tag",
};

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
    <section className="flex flex-col gap-5">
      <h1>Материалы</h1>

      <Card>
        <CardHeader>
          <CardTitle>Новый материал</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(onSubmit)(event)}>
            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Название
              <Input {...register("name")} placeholder="Трикотаж «Петроль»" />
              {errors.name && <span className="text-[0.8rem] font-semibold text-destructive">{errors.name.message}</span>}
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Тип
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
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Единица измерения
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
            </label>

            <label className="flex flex-col gap-1.5 text-[0.9rem] font-semibold text-muted-foreground">
              Точка перезаказа
              <Controller
                name="reorderPoint"
                control={control}
                render={({ field }) => (
                  <NumberInput value={field.value} onChange={field.onChange} min={0} decimals={3} suffix={selectedUnit} />
                )}
              />
            </label>

            <Button type="submit" loading={isSubmitting}>
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
          <SearchBar value={query} onChange={setQuery} placeholder="Поиск материала" />
          <FilterTabs options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />

          <ListCard
            items={items
              .filter((row) => typeFilter === "all" || row.type === typeFilter)
              .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))}
            getKey={(row) => row.id}
            getIcon={(row) => MATERIAL_ICONS[row.type] ?? "box"}
            getTitle={(row) => row.name}
            getMeta={(row) => (row.reorderPoint ? `Точка перезаказа: ${row.reorderPoint} ${row.unit}` : row.unit)}
            emptyTitle="Пока нет ни одного материала"
            emptyHint="Добавьте первый материал — займёт меньше минуты."
            emptyActionLabel="Добавить материал"
            onEmptyAction={() => setFocus("name")}
          />
        </>
      )}
    </section>
  );
}
