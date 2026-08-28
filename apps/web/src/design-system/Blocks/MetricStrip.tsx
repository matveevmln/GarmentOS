import { useEffect, useState } from "react";
import { cn } from "../utils";

// MetricStrip — полоса ключевых показателей наверху экрана («Внимание
// сегодня»). Оформление перенесено из утверждённого прототипа дословно
// (docs/UI_MIGRATION_PLAN.md, этап 3): 2 колонки на мобильном, 4 на
// широком экране, акцентная подложка у тревожных значений, растущая
// подчёркивающая черта при наведении.
//
// Отличие от прототипа: `value` — число, а не строка. В прототипе поле
// было строкой, и CountUp приходилось разбирать её обратно через Number().

/** Мягкий счётчик: анимирует значение от нуля, уважает
 *  prefers-reduced-motion. Перенесён из прототипа. */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const finite = Number.isFinite(value);
  const [shown, setShown] = useState(finite ? 0 : value);

  useEffect(() => {
    if (!finite) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value === 0) {
      setShown(value);
      return;
    }
    const duration = 620;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [finite, value]);

  return <span className={className}>{finite ? shown : "—"}</span>;
}

export interface MetricItem {
  label: string;
  value: number;
  /** Тон отражает состояние показателя, а не украшает его. */
  tone?: "danger" | "warning";
  /** Куда ведёт показатель. Без него плитка не кликабельна. */
  onSelect?: () => void;
}

export function MetricStrip({ items }: { items: MetricItem[] }) {
  return (
    <div className="stagger grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {items.map((m) => {
        const Tag = m.onSelect ? "button" : "div";
        return (
          <Tag
            key={m.label}
            {...(m.onSelect ? { type: "button" as const, onClick: m.onSelect } : {})}
            className={cn(
              "btn-unset surface-card hairline-accent lift group relative flex flex-col overflow-hidden rounded-[12px] px-4 py-4 text-left md:px-5 md:py-5",
              m.tone ? "accent-surface" : "surface-grad",
              "hover:elev-3 hover:border-primary/25",
              m.onSelect && "focus-ring",
            )}
          >
            <div className="t-meta flex items-center gap-1.5 uppercase tracking-[0.08em]">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-transform duration-200 group-hover:scale-125",
                  m.tone === "danger"
                    ? "bg-danger"
                    : m.tone === "warning"
                      ? "bg-warning"
                      : "bg-primary/55",
                )}
              />
              <span className="truncate">{m.label}</span>
            </div>

            <CountUp
              value={m.value}
              className={cn(
                "t-figure mt-4 text-[38px] md:text-[46px]",
                m.tone === "danger" && "text-danger",
                m.tone === "warning" && "text-warning",
              )}
            />

            <span
              className={cn(
                "mt-4 block h-[2px] w-10 rounded-full transition-all duration-300 group-hover:w-16",
                m.tone === "danger"
                  ? "bg-danger/45"
                  : m.tone === "warning"
                    ? "bg-warning/50"
                    : "bg-primary/40",
              )}
            />
          </Tag>
        );
      })}
    </div>
  );
}
