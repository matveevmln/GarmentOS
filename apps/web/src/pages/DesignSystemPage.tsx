import { useState } from "react";
import { Button } from "../design-system/Button/Button";
import { Input } from "../design-system/Input/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { Combobox } from "../design-system/Select/Combobox";
import { NumberInput, MoneyInput, PercentInput } from "../design-system/Input/NumberInput";
import { DatePicker } from "../design-system/Form/DatePicker";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { KpiCard } from "../design-system/Card/KpiCard";
import { ThemeToggle } from "../design-system/Theme/ThemeToggle";
import { Package, TrendingUp, Wallet } from "lucide-react";
import { Avatar } from "../design-system/Avatar/Avatar";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { ListCard, ListCardItem } from "../design-system/ListCard/ListCard";
import { FilterTabs } from "../design-system/Tabs/FilterTabs";
import { SearchBar } from "../design-system/Search/SearchBar";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { ErrorState } from "../design-system/Feedback/ErrorState";
import { Progress } from "../design-system/Feedback/Progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../design-system/Modal/Dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "../design-system/Tooltip/Tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "../design-system/Popover/Popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../design-system/DropdownMenu/DropdownMenu";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "../design-system/Drawer/Drawer";
import { Upload } from "../design-system/Upload/Upload";
import { toast } from "../design-system/Toast/Toast";
import {
  Accordion,
  AttentionList,
  CostBreakdown,
  DataTable,
  DocumentRow,
  MetricStrip,
  MobileListItem,
  ModelMark,
  MoneyBlock,
  ProductionStepper,
  Td,
  Timeline,
} from "../design-system/Blocks";
import { formatQuantity } from "../lib/format";

// Каталог компонентов дизайн-системы GarmentOS (владелец проекта, п.9) —
// живая страница для проверки состояний, не статичные скриншоты. Не в
// основной навигации (AppLayout) — служебный маршрут для ревью, не
// пользовательский экран.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[0.78rem] font-extrabold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

export function DesignSystemPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "a" | "b">("all");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [comboValue, setComboValue] = useState("");
  const [money, setMoney] = useState<number | undefined>(1250.5);
  const [percent, setPercent] = useState<number | undefined>(12);
  const [qty, setQty] = useState<number | undefined>(undefined);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Design System GarmentOS</h1>
          <p className="text-muted-foreground">
            docs/DESIGN_SYSTEM_MAP.md — каталог Tier A + Tier B-now. Служебная страница для визуального ревью, не
            пункт обычной навигации. Нажмите{" "}
            <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.8em]">⌘K</kbd> в любом месте
            приложения — командная палитра.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <Section title="KPI-блоки (Главная, принцип 22 — «что происходит сейчас?»)">
        <p className="text-[0.75rem] text-muted-foreground">
          Синтетические значения для демонстрации компонента — экран Главная ещё не спроектирован (нет реального
          источника данных, docs/DESIGN_SYSTEM_MAP.md §3.5).
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiCard
            label="Партий в работе"
            value={18}
            hint="в 6 цехах"
            icon={<Package className="h-4 w-4" />}
            trend={{ direction: "up", label: "+3 за неделю", tone: "neutral" }}
          />
          <KpiCard
            label="Ожидаемая прибыль"
            value="612 400 ₽"
            icon={<TrendingUp className="h-4 w-4" />}
            trend={{ direction: "up", label: "+8%" }}
          />
          <KpiCard
            label="В незавершённом производстве"
            value="1 240 000 ₽"
            icon={<Wallet className="h-4 w-4" />}
            trend={{ direction: "down", label: "-4%", tone: "danger" }}
          />
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Основная (default)</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button disabled>Disabled</Button>
          <Button loading={loadingDemo} onClick={() => setLoadingDemo((v) => !v)}>
            {loadingDemo ? "Отправляется..." : "Нажми: loading"}
          </Button>
        </div>
      </Section>

      <Section title="Inputs / Select / Combobox / DatePicker">
        <div className="flex flex-col gap-3 sm:max-w-sm">
          <Input placeholder="Обычное поле" />
          <Select value="opt2" onValueChange={() => {}}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opt1">Опция 1</SelectItem>
              <SelectItem value="opt2">Опция 2</SelectItem>
            </SelectContent>
          </Select>
          <Combobox
            value={comboValue}
            onChange={setComboValue}
            placeholder="Комбобокс с поиском"
            options={[
              { value: "hoodie", label: "Худи Base", hint: "Осень 2026" },
              { value: "tee", label: "Футболка Oversize", hint: "Осень 2026" },
              { value: "pants", label: "Брюки Cargo", hint: "Весна 2027" },
            ]}
          />
          <DatePicker value={date} onChange={setDate} />
        </div>
      </Section>

      <Section title="Числовые поля (Number / Money / Percent)">
        <div className="flex flex-col gap-3 sm:max-w-sm">
          <NumberInput value={qty} onChange={setQty} min={0} placeholder="Количество" />
          <MoneyInput value={money} onChange={setMoney} currency="₽" />
          <PercentInput value={percent} onChange={setPercent} />
        </div>
      </Section>

      <Section title="Search / Filters">
        <SearchBar value={search} onChange={setSearch} placeholder="Поиск" />
        <FilterTabs
          options={[
            { value: "all", label: "Все" },
            { value: "a", label: "Вариант А" },
            { value: "b", label: "Вариант Б" },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </Section>

      <Section title="Статусы (StatusBadge)">
        <div className="flex flex-wrap gap-2">
          {["draft", "placed", "in_progress", "ready_for_pickup", "received", "cancelled", "approved"].map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title="Avatar">
        <div className="flex gap-2">
          <Avatar tone="accent">ДП</Avatar>
          <Avatar tone="success">ХС</Avatar>
          <Avatar tone="warning">СГ</Avatar>
          <Avatar tone="info">ММ</Avatar>
          <Avatar tone="neutral">—</Avatar>
        </div>
      </Section>

      <Section title="Card / ListCard">
        <Card>
          <CardHeader>
            <CardTitle>Пример карточки</CardTitle>
          </CardHeader>
          <CardContent>Содержимое карточки — тот же .card/.card-pad, что и в прототипе.</CardContent>
        </Card>
        <p className="text-[0.75rem] text-muted-foreground">Наведите на строку — приподнимается (кликабельная).</p>
        <ListCard
          items={[{ id: "1", title: "Пример строки", meta: "Подпись" }]}
          getKey={(row) => row.id}
          getIcon={() => "box"}
          getTitle={(row) => row.title}
          getMeta={(row) => row.meta}
          onItemClick={() => toast.success("Открыли бы карточку сущности")}
        />
        <ListCard<{ id: string }>
          items={[]}
          getKey={(row) => row.id}
          getTitle={() => ""}
          emptyTitle="Пока нет заказов пошива"
          emptyHint="Создайте первый заказ — займёт меньше минуты."
          emptyActionLabel="Создать заказ пошива"
          onEmptyAction={() => toast.success("Открыли бы форму создания")}
        />
      </Section>

      <Section title="ListCard — hover-actions (DropdownMenu, паттерн Notion)">
        <p className="text-[0.8rem] text-muted-foreground">
          Наведите курсор на строку (на телефоне действия видны всегда — наведения не существует физически).
        </p>
        <ListCardItem
          icon="factory"
          tone="accent"
          title="Цех «Стежок»"
          meta="12 заказов в работе"
          trailing={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 min-h-0 rounded-full bg-transparent p-0 text-muted-foreground shadow-none hover:bg-secondary"
                  aria-label="Действия"
                >
                  <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4" fill="currentColor">
                    <circle cx="5" cy="12" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="19" cy="12" r="1.8" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Открыть карточку</DropdownMenuItem>
                <DropdownMenuItem>Позвонить</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">Архивировать</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
        />
      </Section>

      <Section title="Tooltip / Popover">
        <div className="flex flex-wrap items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">
                Наведи для подсказки
              </Button>
            </TooltipTrigger>
            <TooltipContent>Понятность без обучения — UX_PRINCIPLES.md §9</TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary" size="sm">
                Открыть Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56">
              <p className="text-[0.85rem] text-foreground">
                Формализованный примитив — уже использовался внутри Select/DatePicker.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </Section>

      <Section title="Progress">
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <Progress value={35} />
          <Progress value={70} />
          <Progress value={100} />
          <p className="text-[0.75rem] text-muted-foreground">
            Пример со синтетическими значениями — на реальных экранах используется только там, где есть подтверждённые
            данные о прогрессе (docs/DESIGN_SYSTEM_MAP.md §3.10).
          </p>
        </div>
      </Section>

      <Section title="Error State">
        <ErrorState onRetry={() => toast.success("Повторная попытка загрузки")} />
      </Section>

      <Section title="Skeleton (загрузка)">
        <Button variant="outline" size="sm" onClick={() => setShowSkeleton((v) => !v)}>
          Переключить
        </Button>
        {showSkeleton && <SkeletonList rows={2} />}
      </Section>

      <Section title="Modal / Dialog">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Открыть модальное окно</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Подтверждение действия</DialogTitle>
              <DialogDescription>Пример модального окна для необратимых действий (отмена заказа и т.п.).</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="destructive">Подтвердить</Button>
              <Button variant="secondary">Отмена</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      <Section title="Drawer / Bottom Sheet">
        <p className="text-[0.75rem] text-muted-foreground">
          На мобильном — снизу экрана (drag-to-dismiss), на десктопе — по центру снизу. Паттерн Telegram/Revolut
          (docs/DESIGN_SYSTEM_MAP.md §1): контекстное действие поверх текущего экрана, без перехода на новую
          страницу.
        </p>
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="secondary">Открыть Drawer (приёмка партии)</Button>
          </DrawerTrigger>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Принять партию</DrawerTitle>
              <DrawerDescription>Заказ №142 — Худи Base, 120 шт. Выберите склад и подтвердите приёмку.</DrawerDescription>
            </DrawerHeader>
            <DrawerFooter>
              <Button onClick={() => toast.success("Партия принята")}>Подтвердить приёмку</Button>
              <DrawerClose asChild>
                <Button variant="secondary">Отмена</Button>
              </DrawerClose>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      </Section>

      <Section title="Upload / Preview">
        <p className="text-[0.75rem] text-muted-foreground">
          Фото ткани/брака/накладной — камера или файл, превью по клику (docs/PRINCIPLES.md принцип 20, п.3).
        </p>
        <Upload files={uploadFiles} onChange={setUploadFiles} hint="JPG, PNG до 10 МБ" />
      </Section>

      <Section title="Toast">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => toast.success("Успешно сохранено")}>
            Success toast
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Не удалось сохранить")}>
            Error toast
          </Button>
        </div>
      </Section>

      {/* Доменные блоки, перенесённые из утверждённого прототипа
          (docs/UI_MIGRATION_PLAN.md, этап 3). Значения ниже —
          демонстрационные, как и во всём каталоге: экраны на эти
          компоненты переводятся на этапах 5-8, тогда данные придут из API. */}
      <Section title="Блоки — производственная шкала партии">
        <p className="text-[0.75rem] text-muted-foreground">
          Пять этапов — это реальный enum <code>production_order_status</code> без{" "}
          <code>cancelled</code> (отмена не этап, а выход из шкалы). Подписи из{" "}
          <code>lib/status.ts</code>.
        </p>
        <Card>
          <CardContent className="pt-4 md:pt-5">
            <ProductionStepper current="in_progress" />
          </CardContent>
        </Card>
      </Section>

      <Section title="Блоки — показатели и внимание">
        <MetricStrip
          items={[
            { label: "Просрочено пошива", value: 6, tone: "danger" },
            { label: "Просрочено закупок", value: 6, tone: "danger" },
            { label: "Материалы заканчиваются", value: 144, tone: "warning" },
            { label: "Партий в работе", value: 18 },
          ]}
        />
        <Card>
          <CardContent className="pt-4 md:pt-5">
            <AttentionList
              items={[
                {
                  id: "1",
                  tone: "danger",
                  title: "Худи Zip",
                  sub: "Швейный цех «Родина» · срок был 2026-08-17",
                  meta: "на 11 дн.",
                },
                {
                  id: "2",
                  tone: "warning",
                  title: "Свитшот Heavy",
                  sub: "Швейный цех «Родина» · срок был 2026-08-20",
                  meta: "на 8 дн.",
                },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Блоки — деньги и себестоимость">
        <Card>
          <div className="grid grid-cols-2 divide-x divide-border md:grid-cols-4">
            <MoneyBlock label="Оплачено" value={402_500} />
            <MoneyBlock label="Остаток" value={172_500} tone="warning" />
            <MoneyBlock label="Себестоимость ед." value={478.5} decimals={2} />
            <MoneyBlock label="Партия" value={575_000} sub="1 200 шт" />
          </div>
        </Card>
        <Card>
          <CardContent className="pt-4 md:pt-5">
            <CostBreakdown
              rows={[
                { label: "Ткань", unitCost: 214.0, total: 256_800, share: 45 },
                { label: "Фурнитура", unitCost: 62.5, total: 75_000, share: 13 },
                { label: "Пошив", unitCost: 165.0, total: 198_000, share: 34 },
                { label: "Упаковка", unitCost: 37.0, total: 44_400, share: 8 },
              ]}
              total={{ label: "Итого", unitCost: 478.5, total: 574_200 }}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Блоки — таблица и её мобильный вид">
        <DataTable
          columns={[
            { key: "model", label: "Модель" },
            { key: "workshop", label: "Цех" },
            { key: "qty", label: "Кол-во", align: "right", width: "110px" },
            { key: "status", label: "Статус", align: "right", width: "170px" },
          ]}
        >
          {[
            { model: "Худи Base", workshop: "Швейный цех «Родина»", qty: 226, status: "received" },
            { model: "Свитшот Crop", workshop: "Швейный цех «Родина»", qty: 212, status: "placed" },
            { model: "Юбка Midi", workshop: "Цех «Восток-Шью»", qty: 228, status: "in_progress" },
          ].map((r) => (
            <tr key={r.model}>
              <Td>{r.model}</Td>
              <Td>{r.workshop}</Td>
              <Td align="right">{formatQuantity(r.qty, "шт")}</Td>
              <Td align="right">
                <StatusBadge status={r.status} />
              </Td>
            </tr>
          ))}
        </DataTable>
        <MobileListItem>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="t-object truncate">Худи Base</div>
              <div className="t-meta mt-1">Швейный цех «Родина» · 226 шт</div>
            </div>
            <StatusBadge status="received" />
          </div>
        </MobileListItem>
      </Section>

      <Section title="Блоки — документы, хронология, знак модели">
        {/* minmax(0,1fr), а не 1fr: у grid-элемента min-width по умолчанию
            auto, и колонка раздувается до min-content содержимого вместо
            того, чтобы дать сработать truncate внутри (поймано на 390px). */}
        <div className="grid gap-3 [grid-template-columns:minmax(0,1fr)] md:[grid-template-columns:minmax(0,1fr)_200px]">
          <Card>
            <CardContent className="pt-4 md:pt-5">
              <DocumentRow
                title="Спецификация ХУД-001"
                version="Актуальная"
                format="PDF"
                date="2026-08-12"
              />
              <DocumentRow title="Инвойс №142" version="v1" format="PDF" date="2026-08-02" />
              <DocumentRow title="Фото контроля" format="JPG" />
            </CardContent>
          </Card>
          <ModelMark code="ХУД-001" />
        </div>
        <Card>
          <CardContent className="pt-4 md:pt-5">
            <Timeline
              items={[
                { title: "Партия принята на склад", date: "2026-08-24", by: "Богдан" },
                { title: "Готово к отгрузке", date: "2026-08-20", by: "Цех «Родина»" },
                { title: "Заказ размещён", date: "2026-07-30", by: "Богдан" },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Блоки — сворачиваемая секция">
        <Accordion title="Спецификация" hint="4 позиции" defaultOpen>
          <p className="t-secondary">
            Раскрытие через утилиту <code>collapsible</code> (grid-template-rows), без замера высоты в JS.
          </p>
        </Accordion>
        <Accordion title="История изменений" hint="12 записей">
          <p className="t-secondary">Свёрнутая секция по умолчанию.</p>
        </Accordion>
      </Section>
    </section>
  );
}
