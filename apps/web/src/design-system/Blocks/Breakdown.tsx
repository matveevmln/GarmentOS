import type { BatchCardBreakdownColorDto } from "@garmentos/shared-types";
import { colorSwatch } from "../../lib/color-swatch";
import { formatQuantity } from "../../lib/format";
import { cn } from "../utils";

// Раскладка партии: цвет → размеры → количество.
//
// Разметка перенесена дословно из финальной версии визуальной лаборатории
// Lovable (ПРОМПТ №08, src/components/gos/production-lab.tsx — компоненты
// Breakdown/SizePill того же проекта, свёрстанные поверх .breakdown-color/
// .size-pill из src/styles.css). Единственное отличие от референса —
// источник цвета: там фиксированный справочник из 5 оттенков (tone), здесь
// свободный текст (product_variants.color, Вариант A, ПРОМПТ №06.1) через
// lib/color-swatch.ts — неизвестный цвет не угадывается, показывается
// пустым контуром.

/** Образец цвета. Неизвестный цвет — пустой контур, а не выдуманный
 *  оттенок (см. lib/color-swatch.ts). */
export function ColorDot({ color, className }: { color: string; className?: string }) {
  const swatch = colorSwatch(color);
  return (
    <span
      aria-hidden
      className={cn("swatch-dot inline-block h-[17px] w-[17px] shrink-0 rounded-full border border-foreground/10", className)}
      style={swatch ? { background: swatch } : { background: "transparent", borderColor: "var(--input)" }}
    />
  );
}

/** Двухсегментная «пилюля» размера: размер — залитый цветной сегмент,
 *  количество — плоский сегмент рядом. Перенесено дословно из референса
 *  (.size-pill окрашивает именно первый сегмент через --batch-size);
 *  количество тяжелее по начертанию (font-semibold против font-medium
 *  у размера) — оно то, что сравнивают взглядом по столбцу. */
export function SizePill({ size, quantity }: { size: string; quantity: number }) {
  return (
    <span className="size-pill inline-grid h-[38px] grid-cols-[auto_auto] overflow-hidden rounded-[7px] border border-border bg-card text-[13px]">
      <span className="grid min-w-[54px] place-items-center px-2.5 font-medium">{size}</span>
      <span className="num grid min-w-[48px] place-items-center px-2.5 font-semibold text-foreground">
        {quantity}
      </span>
    </span>
  );
}

/** Полная раскладка: цвет → итог → размеры. */
export function ColorBreakdown({ breakdown }: { breakdown: BatchCardBreakdownColorDto[] }) {
  return (
    <div className="batch-breakdown">
      {breakdown.map((row) => (
        <section key={row.color} className="breakdown-color px-4 py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <ColorDot color={row.color} />
              <h4 className="truncate text-[16px] font-semibold">{row.color}</h4>
            </div>
            <span className="num text-[14px] font-semibold text-foreground">{formatQuantity(row.quantity)} шт.</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {row.sizes.map((size) => (
              <SizePill key={size.size} size={size.size} quantity={size.quantity} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
