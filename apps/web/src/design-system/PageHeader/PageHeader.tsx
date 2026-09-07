import type { ReactNode } from "react";
import { IconChevronRight } from "../Icons/icons";
import { cn } from "../utils";

// GarmentPageHeader + Breadcrumbs — перенесены из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2). Новые компоненты: раньше каждая
// страница верстала свой <h1> с произвольными отступами, из-за чего
// заголовки на разных экранах отличались размером и расстоянием до
// контента. Здесь — единый заголовок страницы с местом под хлебные
// крошки, подзаголовок и действия.

export interface Crumb {
  label: string;
  to?: string;
  onClick?: () => void;
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav className={cn("flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground", className)}>
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <IconChevronRight size={12} className="opacity-60" /> : null}
          {item.onClick ? (
            <button
              type="button"
              onClick={item.onClick}
              className="focus-ring rounded-[4px] transition-colors hover:text-foreground"
            >
              {item.label}
            </button>
          ) : (
            <span className={index === items.length - 1 ? "text-foreground" : undefined}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("anim-rise mb-5 md:mb-6", className)}>
      {breadcrumbs}
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {/* Шкала заголовка — как в прототипе: t-page на мобильном,
              крупный t-display 38px от md. На этапе 2 md-часть была
              потеряна; вызовов у компонента ещё не было, правим до
              первого применения (docs/UI_MIGRATION_PLAN.md §0). */}
          <h1 className="t-page md:t-display md:text-[38px]">{title}</h1>
          {subtitle ? <p className="t-secondary mt-2 max-w-[68ch]">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      {/* Тонкая линия с акцентом слева — отделяет шапку от содержимого,
          не создавая жирной границы. */}
      <span className="mt-4 block h-px w-full bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_55%,transparent)_0%,var(--border)_18%,transparent_86%)]" />
    </header>
  );
}
