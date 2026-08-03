import { useState } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover/Popover";
import { cn } from "../utils";

// GarmentCombobox — docs/DESIGN_SYSTEM_MAP.md §3.3/§4.1: реальный пробел
// в форме-эталоне — выбор модели/цеха через обычный Select не масштабируется
// за пределы ~15-20 записей (каталог моделей растёт с каждым сезоном).
// cmdk — то же, на чём построен shadcn Command/Combobox; Popover — уже
// формализованный примитив GarmentOS.
export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Выберите...",
  searchPlaceholder = "Поиск...",
  emptyText = "Ничего не найдено",
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "flex h-11 min-h-11 w-full items-center justify-between gap-2 rounded-[11px] border border-border bg-card px-3 py-2 text-left text-[0.95rem]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !selected && "text-muted-foreground",
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <CommandPrimitive className="flex flex-col">
          <CommandPrimitive.Input
            placeholder={searchPlaceholder}
            className="h-11 w-full border-b border-border bg-transparent px-3 text-[0.9rem] outline-none placeholder:text-muted-foreground"
          />
          <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1.5">
            <CommandPrimitive.Empty className="px-3 py-6 text-center text-[0.85rem] text-muted-foreground">
              {emptyText}
            </CommandPrimitive.Empty>
            {options.map((option) => (
              <CommandPrimitive.Item
                key={option.value}
                value={`${option.label} ${option.hint ?? ""}`}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-10 cursor-pointer select-none items-center justify-between gap-2 rounded-[10px] px-2.5 text-[0.88rem]",
                  "data-[selected=true]:bg-secondary",
                )}
              >
                <span className="flex flex-col truncate">
                  <span className="truncate font-medium text-foreground">{option.label}</span>
                  {option.hint && <span className="truncate text-[0.75rem] text-muted-foreground">{option.hint}</span>}
                </span>
                {option.value === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </CommandPrimitive.Item>
            ))}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
