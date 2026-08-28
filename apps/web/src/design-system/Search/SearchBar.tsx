import { IconSearch } from "../Icons/icons";
import { cn } from "../utils";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

// GarmentSearchBar — визуальный слой из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2): иконка внутри поля слева, плотная
// высота, фокус через общий утилити-класс `field` дизайн-системы.
// API сохранён ({value, onChange, placeholder}) — вызовы на страницах
// не меняются.
export function SearchBar({ value, onChange, placeholder, className }: SearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <IconSearch
        size={16}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="field h-11 w-full rounded-[10px] border border-border bg-card pl-8 pr-3 text-[13px] placeholder:text-muted-foreground md:h-9"
      />
    </div>
  );
}
