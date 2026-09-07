import { useState, type CSSProperties } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { DayPicker } from "react-day-picker";
import { ru } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "../utils";
import "react-day-picker/style.css";

// GarmentDatePicker — react-day-picker (тот же выбор, что использует
// shadcn Calendar) в Radix Popover, локаль ru (docs/PRINCIPLES.md,
// принцип 21 — весь интерфейс на русском). Заменяет нативный
// <input type="date"> (mm/dd/yyyy — не читаемый формат для русского
// пользователя) в форме-эталоне (docs/UI_FOUNDATION.md).
interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function DatePicker({ value, onChange, placeholder = "Выберите дату", disabled }: DatePickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "field h-10 min-h-10 rounded-[10px] border border-border bg-card px-3 text-[13px] md:h-9 md:min-h-9 flex w-full items-center gap-2 text-left",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          {value ? value.toLocaleDateString("ru-RU") : placeholder}
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          className="z-50 rounded-[16px] border border-border bg-popover p-2 shadow-card"
        >
          <DayPicker
            mode="single"
            locale={ru}
            selected={value}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
            style={
              {
                // Тема react-day-picker v10 через её собственные CSS-переменные
                // (--rdp-*, react-day-picker/style.css) — фирменные токены
                // вместо дефолтного синего, не построчная перепись каждого
                // внутреннего класса библиотеки.
                "--rdp-accent-color": "var(--color-primary)",
                "--rdp-accent-background-color": "var(--color-accent)",
                "--rdp-today-color": "var(--color-primary)",
              } as CSSProperties
            }
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
