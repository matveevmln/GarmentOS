import { cn } from "../utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterTabsProps<T extends string> {
  options: FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

// GarmentFilterTabs — визуальный слой из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2): активный фильтр помечен акцентной
// подложкой и кромкой снизу, а не сплошной тёмной заливкой.
// API сохранён (options как {value,label}[], дженерик T) — прототип
// принимал просто string[], что потеряло бы ключи фильтрации.
export function FilterTabs<T extends string>({ options, value, onChange, className }: FilterTabsProps<T>) {
  return (
    <div className={cn("-mx-1 flex flex-wrap gap-1 px-1", className)} role="tablist">
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(option.value)}
            className={cn(
              // btn-unset: легаси-правило `button {}` добавляет чипу оранжевое
              // свечение box-shadow, которого нет в прототипе.
              "btn-unset interactive focus-ring h-9 rounded-[10px] border px-2.5 text-[12px] font-medium md:h-8",
              isActive
                ? "border-primary/35 bg-primary/[0.10] text-primary shadow-[inset_0_-2px_0_0_color-mix(in_oklab,var(--primary)_45%,transparent)]"
                : "border-border bg-card text-muted-foreground hover:border-primary/25 hover:bg-muted hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
