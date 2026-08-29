import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useMatch } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { cn } from "../design-system/utils";
import { IconButton } from "../design-system/Button/Button";
import { openCommandPalette } from "../design-system/CommandPalette/CommandPalette";
import {
  IconBatch,
  IconClose,
  IconHome,
  IconMaterial,
  IconMenu,
  IconModel,
  IconPanel,
  IconPurchase,
  IconSearch,
  IconSupplier,
  IconWarehouse,
  IconWorkshop,
  IconCheck,
  IconDocument,
  IconUser,
} from "../design-system/Icons/icons";

// AppShell — оболочка приложения: тёмный фирменный рельс слева, стеклянная
// верхняя панель, мобильный drawer со свайпом от края и нижняя навигация.
// Структура и оформление перенесены из утверждённого прототипа дословно
// (docs/UI_MIGRATION_PLAN.md, этап 4).
//
// Заменяет layout/AppLayout.tsx. Главное следствие: у основной области
// больше нет предела 760px (`.app-main` в легаси styles.css) — контент
// занимает до 1440px, как в прототипе.
//
// Отличие от прототипа — способ навигации. Там экраны переключались через
// `onNavigate(ScreenKey)` и useState, здесь остаётся react-router: NavLink
// + существующие маршруты. Роутер не трогаем (docs/UI_MIGRATION_PLAN.md §1).

interface NavItem {
  to: string;
  label: string;
  icon: (p: { size?: number; className?: string }) => ReactNode;
  /** Дочерние маршруты, при которых пункт остаётся подсвеченным
   *  (паспорт партии → «Заказы пошива», карточка модели → «Модели»). */
  match?: string;
}

// Группы взяты из прототипа. «Документы» появились на этапе 8 вместе с
// реальным экраном. «Финансы» из группы «Учёт» по-прежнему не переносятся:
// у раздела нет ни маршрута, ни API — пункт меню, ведущий в никуда, это
// выдуманная функциональность, а не перенос оформления.
const NAV_PRODUCTION: NavItem[] = [
  { to: "/dashboard", label: "Главная", icon: IconHome },
  { to: "/production-orders", label: "Заказы пошива", icon: IconBatch, match: "/production-orders/*" },
  { to: "/products", label: "Модели", icon: IconModel, match: "/products/*" },
  { to: "/workshops", label: "Цеха", icon: IconWorkshop },
];

const NAV_SUPPLY: NavItem[] = [
  { to: "/materials", label: "Материалы", icon: IconMaterial },
  { to: "/purchase-orders", label: "Закупки", icon: IconPurchase },
  { to: "/warehouses", label: "Склады", icon: IconWarehouse },
  { to: "/suppliers", label: "Поставщики", icon: IconSupplier },
];

const NAV_OFFICE: NavItem[] = [{ to: "/documents", label: "Документы", icon: IconDocument }];

// Pilot v1 (владелец проекта, 2026-08-04, docs/MASTER_BACKLOG.md, раздел
// 0.5) — временный пункт, убрать после завершения пилота.
const NAV_SERVICE: NavItem[] = [{ to: "/pilot", label: "Pilot v1", icon: IconCheck }];

// Нижняя навигация мобильного: четыре самых частых раздела + «Ещё».
const MOBILE_NAV: NavItem[] = [
  { to: "/dashboard", label: "Главная", icon: IconHome },
  { to: "/production-orders", label: "Заказы", icon: IconBatch, match: "/production-orders/*" },
  { to: "/products", label: "Модели", icon: IconModel, match: "/products/*" },
  { to: "/materials", label: "Материалы", icon: IconMaterial },
];

const ALL_NAV = [...NAV_PRODUCTION, ...NAV_SUPPLY, ...NAV_OFFICE, ...NAV_SERVICE];

/** Подсветка родительского пункта на вложенном маршруте. Хук вызывается
 *  безусловно — правило Rules of Hooks; при отсутствии `match` он просто
 *  проверяет заведомо несуществующий путь. */
function useNavActive(item: NavItem, pathname: string): boolean {
  const childMatch = useMatch(item.match ?? "__none__");
  return pathname === item.to || Boolean(item.match && childMatch);
}

function NavLinkItem({
  item,
  collapsed,
  mobile,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  mobile: boolean;
  onNavigate: () => void;
}) {
  const { pathname } = useLocation();
  const isActive = useNavActive(item, pathname);
  const Icon = item.icon;
  return (
    <li>
      <NavLink
        to={item.to}
        onClick={onNavigate}
        title={item.label}
        className={cn(
          "btn-unset interactive focus-ring group relative flex w-full items-center gap-3 rounded-[8px] pl-3 pr-2",
          mobile ? "min-h-[48px] py-3 text-[15px]" : "py-2.5 text-[13.5px]",
          collapsed && "justify-center px-0",
          isActive
            ? "nav-active font-medium text-sidebar-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
        )}
      >
        <span
          className={cn(
            "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-sidebar-primary shadow-[0_0_12px_0_color-mix(in_oklab,var(--sidebar-primary)_70%,transparent)] transition-[opacity,transform] duration-200",
            isActive ? "scale-y-100 opacity-100" : "scale-y-50 opacity-0",
          )}
        />
        <span
          className={cn(
            "transition-[color,transform] duration-200 group-hover:translate-x-[1px]",
            isActive ? "text-sidebar-primary" : "text-current",
          )}
        >
          <Icon size={mobile ? 18 : 17} />
        </span>
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
      </NavLink>
    </li>
  );
}

function NavGroup({
  label,
  items,
  collapsed,
  mobile = false,
  onNavigate,
}: {
  label: string;
  items: NavItem[];
  collapsed: boolean;
  mobile?: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="px-3">
      {!collapsed ? (
        <div className="px-3 pb-2 pt-6 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/40">
          {label}
        </div>
      ) : (
        <div className="mx-3 my-3 border-t border-sidebar-border/60" />
      )}
      <ul className="space-y-0.5">
        {items.map((it) => (
          <NavLinkItem key={it.to} item={it} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} />
        ))}
      </ul>
    </div>
  );
}

/* Знак GarmentOS: игольное ушко и нить — перенесён из прототипа */
function BrandMark() {
  return (
    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_oklab,var(--sidebar-primary)_18%,var(--sidebar))]">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M10 2.5v7.2" stroke="var(--sidebar-primary)" strokeWidth="1.6" strokeLinecap="round" />
        <ellipse cx="10" cy="12.1" rx="2.5" ry="3.2" stroke="var(--sidebar-primary)" strokeWidth="1.6" />
        <path
          d="M4.2 17.5c1.9-1.5 3.8-1.5 5.8 0"
          stroke="var(--sidebar-foreground)"
          strokeOpacity="0.55"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/** Инициалы из полного имени — «Богдан Матвеев» → «БМ». */
function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function SidebarBody({
  collapsed,
  mobile = false,
  onNavigate,
}: {
  collapsed: boolean;
  mobile?: boolean;
  onNavigate: () => void;
}) {
  const { user, logout } = useAuth();
  return (
    <div data-rail className="rail-ambient isolate flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center gap-2.5 px-5",
          mobile ? "h-[72px]" : "h-[76px]",
          collapsed && "justify-center px-0",
        )}
      >
        <BrandMark />
        {!collapsed ? (
          <span className="flex min-w-0 flex-col leading-none">
            <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-sidebar-foreground">
              GarmentOS
            </span>
            <span className="mt-1.5 block text-[9px] uppercase leading-none tracking-[0.1em] text-sidebar-foreground/40">
              производственная система
            </span>
          </span>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto pb-4">
        <NavGroup label="Производство" items={NAV_PRODUCTION} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} />
        <NavGroup label="Снабжение" items={NAV_SUPPLY} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} />
        <NavGroup label="Учёт" items={NAV_OFFICE} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} />
        <NavGroup label="Служебное" items={NAV_SERVICE} collapsed={collapsed} mobile={mobile} onNavigate={onNavigate} />
      </nav>

      {/* Подвал рельса. В прототипе здесь имя и название компании; названия
          компании в API нет (AuthenticatedUserResponseDto отдаёт только
          companyId), поэтому вторая строка — роль пользователя, реальные
          данные, а не выдуманная подпись. */}
      <div className={cn("border-t border-sidebar-border/60 p-4", collapsed && "px-0 text-center")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--sidebar-primary)_22%,var(--sidebar))] text-[11px] font-semibold tracking-[0.02em] text-sidebar-primary">
            {user ? initials(user.fullName) : <IconUser size={16} />}
          </span>
          {!collapsed && user ? (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-sidebar-foreground">{user.fullName}</span>
              <span className="block truncate text-[11.5px] text-sidebar-foreground/45">
                {user.roles.join(", ") || user.email}
              </span>
            </span>
          ) : null}
          {!collapsed ? (
            <button
              type="button"
              onClick={logout}
              className="btn-unset interactive focus-ring shrink-0 rounded-[6px] px-2 py-1.5 text-[12px] text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              Выйти
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Ширина мобильной панели не больше 86% экрана — как в прототипе. */
function panelWidthSafe(max: number) {
  if (typeof window === "undefined") return max;
  return Math.min(max, window.innerWidth * 0.86);
}

const PANEL_W = 300;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { pathname } = useLocation();

  const gesture = useRef<{
    startX: number;
    startY: number;
    active: boolean;
    from: "edge" | "panel";
    offset: number;
    lastX: number;
    lastT: number;
    velocity: number;
    width: number;
    raf: number;
    pendingX: number | null;
  } | null>(null);
  const edgeRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // Панель смонтирована всегда. Подготовка слоя выполняется один раз,
  // а в горячем touchmove меняется только compositor-friendly transform.
  const prepareDrag = () => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    const layer = layerRef.current;
    if (!panel || !backdrop || !layer) return;
    layer.style.pointerEvents = "auto";
    layer.style.visibility = "visible";
    panel.style.transition = "none";
    backdrop.style.transition = "none";
    backdrop.style.opacity = "1";
  };

  const applyDrag = (x: number, width: number) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel) return;
    panel.style.transform = `translate3d(${x}px,0,0)`;
    if (backdrop) {
      const progress = Math.max(0, Math.min(1, (x + width) / width));
      backdrop.style.opacity = String(progress);
    }
  };

  const clearDrag = () => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    const layer = layerRef.current;
    if (panel) {
      panel.style.transition = "";
      panel.style.transform = "";
    }
    if (backdrop) {
      backdrop.style.transition = "";
      backdrop.style.opacity = "";
    }
    if (layer) {
      layer.style.pointerEvents = "";
      layer.style.visibility = "";
    }
  };

  const closeNav = useCallback(() => {
    clearDrag();
    setMobileNavOpen(false);
  }, []);

  const startGesture = useCallback((t: { clientX: number; clientY: number }, from: "edge" | "panel") => {
    const w = panelWidthSafe(PANEL_W);
    gesture.current = {
      startX: t.clientX,
      startY: t.clientY,
      active: false,
      from,
      offset: from === "panel" ? 0 : -w,
      lastX: t.clientX,
      lastT: performance.now(),
      velocity: 0,
      width: w,
      raf: 0,
      pendingX: null,
    };

    const move = (ev: TouchEvent) => {
      const g = gesture.current;
      const p = ev.touches[0];
      if (!g || !p) return;
      const dx = p.clientX - g.startX;
      const dy = p.clientY - g.startY;
      if (!g.active) {
        if (Math.abs(dx) < 1) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          gesture.current = null;
          window.removeEventListener("touchmove", move);
          return;
        }
        if (g.from === "edge" && dx <= 0) return;
        g.active = true;
        prepareDrag();
      }
      if (ev.cancelable) ev.preventDefault();
      const now = performance.now();
      const dt = now - g.lastT;
      if (dt > 0) {
        const v = (p.clientX - g.lastX) / dt;
        // EMA-сглаживание скорости — устойчивое распознавание flick без дёрганий
        g.velocity = g.velocity * 0.7 + v * 0.3;
      }
      g.lastX = p.clientX;
      g.lastT = now;
      const next =
        g.from === "edge"
          ? Math.min(0, -g.width + Math.max(0, dx))
          : Math.max(-g.width, Math.min(0, dx));
      g.offset = next;
      // Батчинг через rAF: один transform-апдейт на кадр, движение без рывков
      g.pendingX = next;
      if (!g.raf) {
        g.raf = requestAnimationFrame(() => {
          const gg = gesture.current;
          if (gg && gg.pendingX !== null) applyDrag(gg.pendingX, gg.width);
          if (gg) gg.raf = 0;
        });
      }
    };

    const end = () => {
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
      const g = gesture.current;
      gesture.current = null;
      if (!g) return;
      if (g.raf) cancelAnimationFrame(g.raf);
      if (!g.active) return;
      const dist = g.offset + g.width; // сколько панели вытянуто
      const flickOpen = g.velocity > 0.4 && dist > 40;
      const flickClose = g.velocity < -0.4;
      const open = flickOpen || (!flickClose && g.offset > -g.width / 2);
      const panel = panelRef.current;
      const backdrop = backdropRef.current;
      const layer = layerRef.current;
      // Длительность доводки зависит от оставшегося пути
      const remain = open ? -g.offset : g.offset + g.width;
      const ms = Math.round(Math.min(300, Math.max(160, 120 + (remain / g.width) * 180)));
      const ease = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
      if (panel) {
        panel.style.transition = `transform ${ms}ms ${ease}`;
        panel.style.transform = open ? "translate3d(0,0,0)" : `translate3d(${-g.width}px,0,0)`;
      }
      if (backdrop) {
        backdrop.style.transition = `opacity ${ms}ms ease-out`;
        backdrop.style.opacity = open ? "1" : "0";
      }
      if (layer) {
        layer.style.pointerEvents = open ? "auto" : "none";
        layer.style.visibility = "visible";
      }
      setMobileNavOpen(open);
      window.setTimeout(clearDrag, ms + 20);
    };

    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
  }, []);

  // Нативный non-passive listener: перехватываем жест раньше браузерного «назад».
  useEffect(() => {
    const el = edgeRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) startGesture(t, "edge");
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    return () => el.removeEventListener("touchstart", onStart);
  }, [startGesture]);

  const onPanelStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) startGesture(t, "panel");
  };

  // Esc закрывает мобильное меню — в прототипе панель закрывалась только
  // тапом по подложке; клавиатурный выход нужен для доступности.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeNav();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen, closeNav]);

  const topbarTitle = ALL_NAV.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))?.label ?? "GarmentOS";

  return (
    <div className="ambient-field isolate min-h-screen w-full bg-background text-foreground">
      {/* Рельс — десктоп */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-[64px]" : "w-[260px]",
        )}
      >
        <SidebarBody collapsed={collapsed} onNavigate={closeNav} />
      </aside>

      {/* Зона edge-swipe: открытие меню свайпом от левого края */}
      <div
        ref={edgeRef}
        aria-hidden="true"
        style={{ touchAction: "pan-y" }}
        className={cn("fixed left-0 top-0 bottom-[56px] z-40 w-6 md:hidden", mobileNavOpen && "hidden")}
      />

      {/* Мобильный drawer — всегда в DOM, состояние через transform */}
      <div
        ref={layerRef}
        className={cn("fixed inset-0 z-50 md:hidden", mobileNavOpen ? "visible" : "pointer-events-none invisible")}
        onTouchStart={mobileNavOpen ? onPanelStart : undefined}
      >
        <div
          ref={backdropRef}
          className={cn(
            "absolute inset-0 bg-foreground/45 transition-opacity duration-300 ease-out",
            mobileNavOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={closeNav}
        />
        <div
          ref={panelRef}
          className={cn(
            "elev-4 relative flex h-full w-[300px] max-w-[86vw] flex-col bg-sidebar transition-transform duration-300 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] will-change-transform",
            mobileNavOpen ? "[transform:translate3d(0,0,0)]" : "[transform:translate3d(-100%,0,0)]",
          )}
          style={{ touchAction: "pan-y" }}
        >
          <button
            type="button"
            aria-label="Закрыть меню"
            onClick={closeNav}
            className="btn-unset interactive focus-ring absolute right-2 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <IconClose size={18} />
          </button>
          <SidebarBody collapsed={false} mobile onNavigate={closeNav} />
        </div>
      </div>

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "md:pl-[64px]" : "md:pl-[260px]",
        )}
      >
        <header className="glass-bar sticky top-0 z-20 flex h-[60px] items-center gap-2 border-b px-3 shadow-[0_1px_0_0_color-mix(in_oklab,var(--foreground)_4%,transparent),0_10px_24px_-22px_color-mix(in_oklab,var(--foreground)_45%,transparent)] md:px-8">
          <IconButton label="Меню" className="md:hidden" onClick={() => setMobileNavOpen((v) => !v)}>
            <IconMenu size={18} />
          </IconButton>
          <IconButton
            label={collapsed ? "Развернуть навигацию" : "Свернуть навигацию"}
            className="hidden md:inline-flex"
            onClick={() => setCollapsed((c) => !c)}
          >
            <IconPanel size={16} />
          </IconButton>
          <span className="truncate font-display text-[13.5px] font-medium tracking-[-0.01em]">{topbarTitle}</span>
          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            <button
              type="button"
              onClick={openCommandPalette}
              className="btn-unset interactive focus-ring hidden h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground hover:border-primary/25 hover:bg-muted hover:text-foreground lg:inline-flex"
            >
              <IconSearch size={14} />
              Быстрый переход
              <kbd className="micro rounded-[4px] border border-border px-1.5 py-1">⌘K</kbd>
            </button>
            <IconButton label="Быстрый переход" className="lg:hidden" onClick={openCommandPalette}>
              <IconSearch size={16} />
            </IconButton>
          </span>
        </header>

        {/* Предела 760px больше нет: до 1440px, как в прототипе. */}
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-5 pb-24 md:px-8 md:py-7 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* Нижняя навигация — мобильный */}
      <nav className="glass-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_18px_color-mix(in_oklab,var(--foreground)_8%,transparent)] md:hidden">
        {MOBILE_NAV.map((it) => (
          <BottomNavItem key={it.to} item={it} />
        ))}
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="btn-unset interactive focus-ring flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground"
        >
          <IconMenu size={18} />
          Ещё
        </button>
      </nav>
    </div>
  );
}

function BottomNavItem({ item }: { item: NavItem }) {
  const { pathname } = useLocation();
  const isActive = useNavActive(item, pathname);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      className={cn(
        "btn-unset interactive focus-ring relative flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px]",
        isActive ? "font-semibold text-primary" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "absolute inset-x-4 top-0 h-[2px] rounded-b-[2px] bg-primary transition-[opacity,transform] duration-200",
          isActive ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
        )}
      />
      <Icon size={18} />
      {item.label}
    </NavLink>
  );
}
