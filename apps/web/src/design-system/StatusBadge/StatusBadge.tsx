import { statusMeta, type StatusTone } from "../../lib/status";
import { cn } from "../utils";

// GarmentStatusBadge — визуальный слой перенесён из утверждённого
// прототипа (docs/UI_MIGRATION_PLAN.md, этап 2): пилюля с цветной точкой
// слева, тонкая рамка и полупрозрачная подложка вместо плотной заливки.
//
// API сохранён: компонент принимает КЛЮЧ статуса из API ("in_progress"),
// а не готовую подпись. Перевод — единственной картой в lib/status.ts.
// В прототипе StatusBadge принимал русскую строку; это было бы регрессией
// (см. docs/UI_MIGRATION_PLAN.md §3), поэтому взят контракт apps/web.

const TONE_STYLES: Record<StatusTone, string> = {
  neutral: "text-muted-foreground border-border bg-muted/60",
  info: "text-foreground border-border bg-muted/60",
  accent: "text-primary border-primary/25 bg-primary/[0.08]",
  success: "text-success border-success/25 bg-success/[0.08]",
  warning: "text-warning border-warning/30 bg-warning/[0.08]",
  danger: "text-danger border-danger/25 bg-danger/[0.08]",
};

const DOT_STYLES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/60",
  info: "bg-muted-foreground",
  accent: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const { label, tone } = statusMeta(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[4px] text-[11.5px] font-medium transition-colors duration-200",
        TONE_STYLES[tone],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_STYLES[tone])} />
      {label}
    </span>
  );
}

// VersionBadge — новый компонент из прототипа: отмечает актуальную версию
// документа среди прежних. Существующие вызовы не затрагивает.
export function VersionBadge({ label }: { label: string }) {
  const isCurrent = label.toLowerCase().startsWith("актуальн");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] border px-1.5 py-[2px] text-[11px] font-medium",
        isCurrent
          ? "border-success/25 bg-success/[0.08] text-success"
          : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
