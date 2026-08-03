import { useState } from "react";
import { Button } from "../design-system/Button/Button";
import { Input } from "../design-system/Input/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../design-system/Select/Select";
import { DatePicker } from "../design-system/Form/DatePicker";
import { Card, CardContent, CardHeader, CardTitle } from "../design-system/Card/Card";
import { Avatar } from "../design-system/Avatar/Avatar";
import { StatusBadge } from "../design-system/StatusBadge/StatusBadge";
import { ListCard } from "../design-system/ListCard/ListCard";
import { FilterTabs } from "../design-system/Tabs/FilterTabs";
import { SearchBar } from "../design-system/Search/SearchBar";
import { SkeletonList } from "../design-system/Feedback/Skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../design-system/Modal/Dialog";
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

  return (
    <section className="mx-auto flex max-w-3xl flex-col gap-8 p-5">
      <h1>Design System GarmentOS</h1>
      <p className="text-muted-foreground">
        docs/UI_FOUNDATION.md — каталог компонентов Tier A. Служебная страница для визуального ревью, не пункт
        обычной навигации.
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
        </div>
      </Section>

      <Section title="Inputs / Select / DatePicker">
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
          <DatePicker value={date} onChange={setDate} />
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
