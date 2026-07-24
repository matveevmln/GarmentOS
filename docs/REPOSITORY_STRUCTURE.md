# Структура репозитория GarmentOS

> Монорепозиторий на pnpm workspaces + Turborepo (обоснование — [`TECH_STACK.md`](./TECH_STACK.md)).

## Дерево верхнего уровня

```
GarmentOS/
├── apps/
│   ├── api/                     # NestJS backend — единая точка входа API
│   └── web/                     # React + Vite frontend (админ-панель/ERP-интерфейс)
│
├── packages/
│   ├── domain/                  # Доменные модули (см. ниже) — ядро бизнес-логики
│   ├── db-schema/                # Drizzle-схема БД, миграции, seed-данные
│   ├── shared-types/             # Общие типы/DTO/Zod-схемы между api и web
│   ├── ui-kit/                   # Переиспользуемые UI-компоненты (таблицы, формы, layout)
│   ├── connectors/                # Адаптеры внешних систем
│   │   ├── wildberries/
│   │   ├── ozon/
│   │   ├── yandex-market/
│   │   ├── honest-sign/          # ГИС МТ / «Честный Знак»
│   │   └── storage/               # StorageAdapter — реализации под S3/MinIO/Yandex Object Storage и т.д. (см. docs/INFRASTRUCTURE.md, 2.3)
│   └── config/                   # Общие конфиги (eslint, tsconfig, tailwind) для всех пакетов
│
├── infra/                          # cloud-agnostic, см. docs/INFRASTRUCTURE.md
│   ├── docker/                    # Dockerfile-ы для api/web/workers
│   ├── docker-compose.yml         # Локальное окружение (postgres, redis, minio, api, web, workers)
│   ├── docker-compose.prod.yml    # Эталонный прод-стек Фазы 1 (Lean-старт, один сервер — любая площадка)
│   ├── provision/                  # Короткие provisioning-скрипты для Стадии A (без Terraform, см. INFRASTRUCTURE.md п.6)
│   ├── terraform/                  # Вводится на Стадии B (несколько окружений/провайдеров) — пусто на Фазе 1
│   └── ci/                        # Вспомогательные скрипты для GitHub Actions
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TECH_STACK.md
│   ├── REPOSITORY_STRUCTURE.md
│   ├── DATABASE_SCHEMA.md
│   ├── ROADMAP.md
│   ├── PRINCIPLES.md
│   ├── QUALITY_STANDARDS.md
│   ├── ARCHITECTURE_SELF_REVIEW.md
│   └── adr/                       # Architecture Decision Records (0001-xxx.md, ...)
│
├── .github/
│   └── workflows/                 # CI: lint, typecheck, test, build
│
├── CLAUDE.md
├── PROJECT_VISION.md
├── README.md
├── package.json                   # workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── .gitignore
```

## Структура `packages/domain/` (детально)

Каждый bounded context из `ARCHITECTURE.md` — отдельная папка со своей внутренней слоистостью (application/domain/infrastructure):

```
packages/domain/
├── identity/                  # пользователи, роли, компании
├── catalog/                   # модели, SKU
├── procurement/                # материалы, поставщики, закупки
├── bom/                        # спецификации расхода материалов (tech_specs удалена, см. docs/DATABASE_SCHEMA.md п.0)
├── contract-manufacturing/     # цеха-подрядчики, заказы пошива (не собственное производство — см. docs/DATABASE_SCHEMA.md п.0)
├── warehouse/                  # склад, остатки, движения
├── sales/                      # заказы всех каналов
├── marketplace-integration/    # оркестрация коннекторов (использует packages/connectors)
├── honest-sign/                # учёт кодов маркировки
├── finance/                    # себестоимость, проводки
└── notifications/              # уведомления
```

Внутри каждого модуля — единообразная структура (пример на `warehouse/`):

```
warehouse/
├── domain/           # сущности, value objects, доменные события, инварианты
├── application/       # use cases (application services), DTO
├── infrastructure/    # реализация репозиториев (Drizzle), внешние вызовы
└── index.ts           # публичный интерфейс модуля — единственное, что видят другие модули
```

**Правило**: импорт из `warehouse/domain` или `warehouse/infrastructure` напрямую из другого модуля запрещён (обеспечивается ESLint-правилом `no-restricted-imports` на уровне монорепо) — только через `warehouse/index.ts`.

## Структура `apps/api/`

```
apps/api/
├── src/
│   ├── modules/           # NestJS-обёртки над packages/domain/* (контроллеры, guards, presentation)
│   ├── main.ts
│   └── app.module.ts
└── test/                   # интеграционные/e2e тесты API
```

`apps/api` — тонкий presentation-слой NestJS поверх `packages/domain/*`. Это разделение сделано, чтобы доменная логика не была привязана к NestJS-специфике и оставалась переносимой (важно для эволюционной архитектуры, см. `ARCHITECTURE.md` п.10 и `PRINCIPLES.md`).

## Структура `apps/web/`

```
apps/web/
├── src/
│   ├── features/           # по одному разделу UI на bounded context (warehouse/, sales/, ...)
│   ├── shared/               # общие хуки, утилиты, layout
│   └── app/                  # роутинг, провайдеры (React Query, Zustand store)
└── e2e/                      # Playwright-тесты
```

## Почему монорепозиторий, а не multi-repo

- Домен сильно связан (см. `ARCHITECTURE.md` п.1) — межмодульные изменения (например, новое поле в `ProductVariant`, которое используют `Sales`, `Warehouse`, `HonestSign`) должны проходить одним PR с согласованным ревью, а не координацией через несколько репозиториев.
- `shared-types` гарантирует, что backend и frontend не рассинхронизируются по контрактам.
- Turborepo кэширует сборки/тесты только для изменённых пакетов — монорепо не означает «всё пересобирается всегда».

## Конвенции именования

- Пакеты: `kebab-case` (`bom-tech-specs`, `marketplace-integration`).
- Файлы TypeScript: `kebab-case.ts`, классы/интерфейсы — `PascalCase` внутри файла.
- Тестовые файлы — рядом с исходником: `stock-item.service.ts` → `stock-item.service.spec.ts`.
