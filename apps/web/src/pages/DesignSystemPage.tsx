import { useState } from "react";
import { Button } from "../design-system/Button/Button";
import { Input } from "../design-system/Input/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { Combobox } from "../design-system/Select/Combobox";
import { NumberInput, MoneyInput, PercentInput } from "../design-system/Input/NumberInput";
import { DatePicker } from "../design-system/Form/DatePicker";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
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
import { toast } from "../design-system/Toast/Toast";

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

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 p-5">
      <h1>Design System GarmentOS</h1>
      <p className="text-muted-foreground">
        docs/DESIGN_SYSTEM_MAP.md — каталог Tier A + Tier B-now. Служебная страница для визуального ревью, не пункт
        обычной навигации. Нажмите <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.8em]">⌘K</kbd> в
        любом месте приложения — командная палитра.
      </p>

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
        <ListCard
          items={[{ id: "1", title: "Пример строки", meta: "Подпись" }]}
          getKey={(row) => row.id}
          getIcon={() => "box"}
          getTitle={(row) => row.title}
          getMeta={(row) => row.meta}
        />
        <ListCard<{ id: string }>
          items={[]}
          getKey={(row) => row.id}
          getTitle={() => ""}
          emptyTitle="Пустое состояние"
          emptyHint="Пример empty state с подсказкой."
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
    </section>
  );
}
