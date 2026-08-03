import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "../utils";

type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "garmentos-theme";
const ORDER: ThemePreference[] = ["system", "light", "dark"];

// GarmentThemeToggle — ручное переопределение поверх архитектурной
// проводки тёмной темы в Tokens/tokens.css (:root[data-theme]). "system"
// снимает атрибут — компонент читает не только meta-состояние (Tailwind-
// токены уже переключаются через CSS, JS здесь нужен только чтобы
// запомнить выбор пользователя между визитами, docs/DESIGN_SYSTEM_MAP.md
// §2.2/визуальное ревью 2026-08-03).
function applyTheme(pref: ThemePreference) {
  if (pref === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = pref;
  }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(STORAGE_KEY) as ThemePreference | null) ?? "system";
  });

  useEffect(() => {
    applyTheme(pref);
    localStorage.setItem(STORAGE_KEY, pref);
  }, [pref]);

  const Icon = pref === "system" ? Monitor : pref === "light" ? Sun : Moon;
  const label = pref === "system" ? "Системная тема" : pref === "light" ? "Светлая тема" : "Тёмная тема";

  return (
    <button
      type="button"
      onClick={() => setPref(ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length])}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-[0.8rem] font-semibold text-foreground",
        "transition-colors hover:bg-secondary",
        className,
      )}
      aria-label={`Переключить тему (сейчас: ${label})`}
      title={label}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
