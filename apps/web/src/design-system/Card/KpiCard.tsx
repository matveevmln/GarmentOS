import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../utils";

// GarmentKPICard — docs/DESIGN_SYSTEM_MAP.md §3.5 (Tier B-now, "под
// ближайшую Главную", принцип 22 — "что происходит сейчас?"). Паттерн
// Stripe Dashboard/Origin UI stat-card: число — главный визуальный вес,
// подпись — второстепенная, тренд — необязательное уточнение, не шум.
interface KpiCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  trend?: { direction: "up" | "down"; label: string; tone?: "success" | "danger" | "neutral" };
  icon?: ReactNode;
  className?: string;
}

export function KpiCard({ label, value, hint, trend, icon, className }: KpiCardProps) {
  const trendTone = trend?.tone ?? (trend?.direction === "up" ? "success" : "danger");
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-[22px] border border-border bg-card p-4 shadow-card",
        "transition-[transform,box-shadow] duration-[var(--animate-duration-base)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:shadow-hover",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.78rem] font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
        {icon && <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[1.85rem] font-extrabold tabular-nums tracking-[-0.02em] text-foreground">{value}</span>
      </div>
      {(trend || hint) && (
        <div className="flex items-center gap-1.5 text-[0.78rem]">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold",
                trendTone === "success" && "bg-success-tint text-success",
                trendTone === "danger" && "bg-destructive/10 text-destructive",
                trendTone === "neutral" && "bg-secondary text-muted-foreground",
              )}
            >
              <TrendIcon className="h-3 w-3" />
              {trend.label}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
