import { cn } from "../utils";

// GarmentSkeleton — визуальный слой из утверждённого прототипа
// (docs/UI_MIGRATION_PLAN.md, этап 2): утилити-класс `skeleton` из
// дизайн-системы вместо собственного градиента, чтобы анимация загрузки
// была единой во всём интерфейсе.
// API сохранён: Skeleton / SkeletonListRow / SkeletonList({rows}).
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[6px]", className)} />;
}

export function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3 last:border-0">
      <Skeleton className="h-3 w-10 rounded-[4px]" />
      <Skeleton className="h-3 flex-1 rounded-[4px]" />
      <Skeleton className="h-3 w-16 rounded-[4px]" />
      <Skeleton className="h-3 w-20 rounded-[4px]" />
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5" aria-busy="true">
      <Skeleton className="h-9 w-1/3 rounded-[10px]" />
      <div className="rounded-[10px] border border-border bg-card p-3">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonListRow key={index} />
        ))}
      </div>
    </div>
  );
}
