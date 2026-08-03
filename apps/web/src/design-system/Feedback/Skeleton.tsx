import { cn } from "../utils";

// GarmentSkeleton — реальный пробел закрыт: раньше везде был текст
// «Загрузка…» (docs/UI_FOUNDATION.md, Tier A). Shimmer (движущаяся световая
// полоса) вместо статичного пульсирующего градиента — визуальное ревью
// 2026-08-03 ("приятные skeleton-загрузчики"), паттерн большинства
// современных SaaS-лоадеров: полоса читается как "идёт загрузка", не
// просто как статичная серая плашка.
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded-[10px] bg-gradient-to-r from-secondary via-border to-secondary bg-[length:200%_100%]",
        className,
      )}
    />
  );
}

export function SkeletonListRow() {
  return (
    <div className="mb-2.5 flex items-center gap-3 rounded-[22px] border border-border bg-card p-3.5 shadow-card">
      <Skeleton className="h-[42px] w-[42px] flex-none" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-3 w-[70%]" />
        <Skeleton className="h-2.5 w-[45%]" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonListRow key={index} />
      ))}
    </div>
  );
}
