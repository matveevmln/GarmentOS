# Структура базы данных GarmentOS

> СУБД — PostgreSQL, ORM — Drizzle (обоснование в [`TECH_STACK.md`](./TECH_STACK.md)). Таблицы сгруппированы по доменным модулям из [`ARCHITECTURE.md`](./ARCHITECTURE.md). Это концептуальная схема (уровень сущностей и связей), а не финальный DDL — конкретные миграции создаются на Фазе 1.

## 1. Сквозные конвенции

- **Именование таблиц**: `snake_case`, множественное число (`products`, `stock_items`).
- **Первичные ключи**: `id UUID DEFAULT gen_random_uuid()` — UUID вместо serial, чтобы избежать угадываемых ID во внешних интеграциях (маркетплейсы видят наши ID через API) и упростить будущий шардинг.
- **Мультитенантность**: каждая доменная таблица содержит `company_id UUID NOT NULL REFERENCES companies(id)`. Все запросы приложения обязаны фильтровать по `company_id` (обеспечивается на уровне application layer + композитные индексы `(company_id, ...)`; путь к PostgreSQL Row-Level Security открыт на будущее).
- **Аудит-поля** на каждой таблице: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `created_by UUID REFERENCES users(id)`.
- **Мягкое удаление** для справочников и документов с историей (`deleted_at TIMESTAMPTZ NULL`) — обязательно для `products`, `product_variants`, `materials`, `orders` и т.д.; физическое удаление запрещено для сущностей с финансовым/комплаенс-следом (коды маркировки, проводки).
- **Деньги**: тип `numeric(14,2)` (никогда `float`), валюта фиксируется на уровне компании (мультивалютность — вне скоупа MVP).
- **Количества (SKU)**: `numeric(12,3)` — учитывает как штучный товар, так и материалы, которые могут измеряться в метрах/килограммах с дробной частью.
- **Внешние ID** (ID заказа в WB, ID SKU в Ozon и т.д.) хранятся рядом с нашим ID как `external_id text`, не заменяют собственный PK.

## 2. ER-диаграмма (укрупнённо)

```mermaid
erDiagram
    COMPANIES ||--o{ USERS : has
    COMPANIES ||--o{ WAREHOUSES : has
    COMPANIES ||--o{ PRODUCTS : owns
    COMPANIES ||--o{ SUPPLIERS : has
    COMPANIES ||--o{ MARKETPLACE_ACCOUNTS : has

    PRODUCTS ||--o{ PRODUCT_VARIANTS : "size x color"
    PRODUCTS ||--o{ BOM : specification
    BOM ||--o{ BOM_ITEMS : contains
    BOM_ITEMS }o--|| MATERIALS : uses

    SUPPLIERS ||--o{ PURCHASE_ORDERS : receives
    PURCHASE_ORDERS ||--o{ PURCHASE_ORDER_ITEMS : contains
    PURCHASE_ORDER_ITEMS }o--|| MATERIALS : orders

    PRODUCTS ||--o{ PRODUCTION_ORDERS : produced_as
    PRODUCTION_ORDERS ||--o{ PRODUCTION_BATCHES : split_into
    PRODUCTION_BATCHES ||--o{ PRODUCTION_STAGES : goes_through

    WAREHOUSES ||--o{ STOCK_ITEMS : holds
    PRODUCT_VARIANTS ||--o{ STOCK_ITEMS : tracked_as
    STOCK_ITEMS ||--o{ STOCK_MOVEMENTS : history

    PRODUCT_VARIANTS ||--o{ MARKING_CODES : labeled_with
    MARKING_CODES ||--o{ MARKING_CODE_EVENTS : status_history

    MARKETPLACE_ACCOUNTS ||--o{ MARKETPLACE_LISTINGS : lists
    PRODUCT_VARIANTS ||--o{ MARKETPLACE_LISTINGS : mapped_to

    ORDERS ||--o{ ORDER_ITEMS : contains
    PRODUCT_VARIANTS ||--o{ ORDER_ITEMS : sold_as
    SALES_CHANNELS ||--o{ ORDERS : source

    ORDERS ||--o{ COST_ENTRIES : generates
```

## 3. Identity & Access

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `companies` | `id`, `name`, `legal_name`, `inn`, `timezone`, `default_currency` | Тенант. Корень мультитенантности |
| `users` | `id`, `company_id`, `email`, `password_hash`, `full_name`, `is_active` | Пользователь всегда принадлежит компании |
| `roles` | `id`, `company_id NULL` (глобальные роли) или `company_id` (кастомные), `name`, `code` | Предустановленные: `director`, `accountant`, `procurement`, `technologist`, `marketplace_manager`, `warehouse_keeper` — см. `PROJECT_VISION.md` |
| `permissions` | `id`, `code` (например, `warehouse.stock.write`), `module` | Гранулярные права по модулю/действию |
| `role_permissions` | `role_id`, `permission_id` | Многие-ко-многим |
| `user_roles` | `user_id`, `role_id` | Пользователь может иметь несколько ролей (актуально для малых команд) |

## 4. Catalog

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `products` | `id`, `company_id`, `name`, `code` (артикул модели), `category`, `season`, `status` (`draft/active/discontinued`) | Модель одежды на уровне абстракции, без размера/цвета |
| `product_variants` | `id`, `product_id`, `size`, `color`, `sku_code` (уникальный внутри компании), `barcode` (EAN/GTIN) | Конкретный SKU — единица учёта остатков и продаж |

## 5. Materials & Procurement

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `materials` | `id`, `company_id`, `name`, `type` (`fabric/trim/accessory`), `unit` (`m/kg/pcs`), `reorder_point` | Ткани, фурнитура и прочие материалы |
| `suppliers` | `id`, `company_id`, `name`, `inn`, `contact_info` | Поставщики материалов |
| `purchase_orders` | `id`, `company_id`, `supplier_id`, `status` (`draft/sent/partially_received/received/cancelled`), `expected_date` | Заявка/заказ поставщику |
| `purchase_order_items` | `id`, `purchase_order_id`, `material_id`, `quantity`, `unit_price` | Позиции заказа |

## 6. BOM & Tech Specs

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `boms` | `id`, `company_id`, `product_id`, `version`, `status` (`draft/approved/archived`) | Спецификация версионируется — изменение нормы расхода не должно портить историю уже произведённых партий |
| `bom_items` | `id`, `bom_id`, `material_id`, `quantity_per_unit`, `waste_percent` | Норма расхода материала на единицу модели с учётом отхода |
| `tech_specs` | `id`, `company_id`, `product_id`, `version`, `operations_json` (или отдельная таблица `tech_spec_operations`), `standard_time_minutes` | Техкарта: последовательность операций пошива и нормы времени |

## 7. Production

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `production_orders` | `id`, `company_id`, `product_id`, `bom_id`, `planned_quantity`, `status`, `due_date` | Заказ на производство определённой модели |
| `production_batches` | `id`, `production_order_id`, `batch_number`, `quantity`, `status` | Партия кроя/пошива (может быть несколько партий на один заказ) |
| `production_batch_variants` | `production_batch_id`, `product_variant_id`, `quantity` | Разбивка партии по размеру/цвету (SKU) |
| `production_stages` | `id`, `production_batch_id`, `stage_type` (`cutting/sewing/qc/packaging`), `status`, `started_at`, `completed_at`, `responsible_user_id` | Этапы производства для прозрачности («где партия сейчас») |

## 8. Warehouse & Inventory

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `warehouses` | `id`, `company_id`, `name`, `type` (`own/marketplace_fbo/consignment`) | Поддержка складов маркетплейсов (FBO) как отдельного типа склада важно для сверки остатков |
| `stock_items` | `id`, `warehouse_id`, `product_variant_id`, `quantity_on_hand`, `quantity_reserved` | Текущий остаток по SKU на складе. `quantity_reserved` — под неотгруженные заказы |
| `stock_movements` | `id`, `stock_item_id`, `type` (`receipt/shipment/adjustment/transfer`), `quantity`, `reference_type`, `reference_id`, `occurred_at` | Полная история движений — источник истины, `quantity_on_hand` можно пересчитать из истории (аудируемость) |
| `inventory_counts` | `id`, `warehouse_id`, `status`, `performed_by`, `performed_at` | Инвентаризация |
| `inventory_count_items` | `inventory_count_id`, `product_variant_id`, `expected_quantity`, `actual_quantity`, `discrepancy` | Расхождения факта и учёта — метрика успеха проекта (см. `PROJECT_VISION.md`, критерий 1) |

## 9. Sales & Orders

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `sales_channels` | `id`, `company_id`, `type` (`marketplace/wholesale/retail/own_website`), `name` | Унифицированный источник продажи |
| `orders` | `id`, `company_id`, `sales_channel_id`, `external_order_id`, `status`, `total_amount`, `ordered_at` | Единый заказ независимо от канала |
| `order_items` | `id`, `order_id`, `product_variant_id`, `quantity`, `unit_price` | Позиции заказа |

## 10. Marketplace Integration

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `marketplaces` | `id`, `code` (`wildberries/ozon/yandex_market`), `name` | Справочник поддерживаемых площадок |
| `marketplace_accounts` | `id`, `company_id`, `marketplace_id`, `api_credentials_encrypted`, `is_active` | Личный кабинет продавца компании на площадке. Credentials хранятся зашифрованными (см. `QUALITY_STANDARDS.md`, требования безопасности) |
| `marketplace_listings` | `id`, `marketplace_account_id`, `product_variant_id`, `external_sku_id`, `current_price`, `current_stock_reported` | Связка нашего SKU с карточкой на площадке |
| `marketplace_sync_logs` | `id`, `marketplace_account_id`, `sync_type`, `status`, `started_at`, `finished_at`, `error_details` | Наблюдаемость интеграций — критично при расследовании рассинхронизации остатков |

## 11. Honest Sign (Честный Знак)

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `marking_codes` | `id`, `company_id`, `product_variant_id`, `code_value` (DataMatrix), `status` (`issued/applied/introduced/sold/retired/damaged`), `production_batch_id NULL` | Код маркировки — центральная сущность комплаенс-модуля |
| `marking_code_events` | `id`, `marking_code_id`, `event_type`, `occurred_at`, `reference_type`, `reference_id`, `payload_json` | История статусов для аудита перед ГИС МТ |

## 12. Finance

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `cost_entries` | `id`, `company_id`, `product_variant_id`, `production_batch_id NULL`, `material_cost`, `labor_cost`, `overhead_cost`, `calculated_at` | Себестоимость единицы — материалы (из BOM × закупочная цена) + нормативные трудозатраты (из tech_specs) |
| `transactions` | `id`, `company_id`, `type` (`income/expense`), `amount`, `reference_type`, `reference_id`, `occurred_at` | Движение денег для управленческого учёта |
| `invoices` | `id`, `company_id`, `order_id NULL`, `purchase_order_id NULL`, `status`, `amount`, `due_date` | Документы к оплате/получению |

## 13. Общие/сквозные

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `audit_log` | `id`, `company_id`, `user_id`, `entity_type`, `entity_id`, `action`, `before_json`, `after_json`, `occurred_at` | Аудит критичных операций (см. `ARCHITECTURE.md` п.7) |
| `notifications` | `id`, `company_id`, `user_id`, `type`, `payload_json`, `read_at` | Уведомления (низкий остаток, срыв сроков производства и т.д.) |

## 14. Индексация — базовые правила

- Композитный индекс `(company_id, id)` или включение `company_id` первым полем в любой составной индекс — так как фильтрация по тенанту присутствует в каждом запросе.
- `stock_items`: уникальный индекс `(warehouse_id, product_variant_id)`.
- `marking_codes.code_value`: уникальный индекс (глобально уникален по природе DataMatrix-кода).
- `order_items`, `stock_movements`: индекс по `occurred_at`/`ordered_at` для отчётных запросов по периодам.
- `marketplace_listings`: уникальный индекс `(marketplace_account_id, external_sku_id)`.

## 15. Миграции

- Управляются через Drizzle Kit, миграции — часть `packages/db-schema`, версионируются в git, применяются в CI перед деплоем (см. `QUALITY_STANDARDS.md`).
- Правило: миграция, ломающая обратную совместимость (удаление колонки, NOT NULL без дефолта на непустой таблице), разбивается на два релиза (expand → migrate data → contract), а не выполняется одним шагом на проде.

## 16. Открытые вопросы по схеме

Вынесены в [`ARCHITECTURE_SELF_REVIEW.md`](./ARCHITECTURE_SELF_REVIEW.md): партиционирование `stock_movements`/`marking_code_events` по мере роста, стратегия RLS вместо application-level фильтрации по `company_id`, схема хранения `api_credentials_encrypted` (KMS vs application-level шифрование).
