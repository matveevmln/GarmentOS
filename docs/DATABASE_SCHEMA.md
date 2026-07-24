# Структура базы данных GarmentOS

> СУБД — PostgreSQL, ORM — Drizzle (обоснование в [`TECH_STACK.md`](./TECH_STACK.md)). Таблицы сгруппированы по доменным модулям из [`ARCHITECTURE.md`](./ARCHITECTURE.md). Это концептуальная схема (уровень сущностей и связей), а не финальный DDL — конкретные миграции создаются на Фазе 1.

## 0. Аудит бизнес-модели (2026-07-24) — почему схема отличается от первой версии

Первая версия этого документа была спроектирована по умолчанию как для вертикально интегрированного производителя (собственный цех, этапы кроя/пошива/ОТК/упаковки, штатные исполнители). Владелец проекта уточнил бизнес-модель: **GarmentOS обслуживает бренд одежды и селлера, а не фабрику**. Компания закупает ткани и фурнитуру, создаёт модели, размещает заказы в нескольких независимых подрядных швейных цехах, контролирует исполнение, принимает готовую продукцию, экспортирует её и продаёт через Wildberries/Ozon.

Проведён построчный аудит всех таблиц (4 вопроса на таблицу: нужна ли бизнесу / нужна ли для MVP / перенести в Future / удалить). Итог: удалены `tech_specs` и `production_stages` (структурно неприменимы — моделировали штатный цех), убраны из MVP `production_batches`/`production_batch_variants` (свёрнуты в `production_orders` + `production_order_variants`), добавлена `workshops`, расширены `production_orders`/`warehouses`/`cost_entries` под давальческую схему и оплату услуг подрядчика. Подробности решения — история этого документа (git log); действующая версия таблиц — ниже.

## 0b. Дополнение: полный жизненный цикл товара и документооборот (2026-07-24, второй проход)

После первого аудита владелец проекта попросил дополнительно проверить схему на соответствие **полному** жизненному циклу — от коллекции и закупки ткани до продажи на маркетплейсе и прибыли, — и явно смоделировать то, что раньше подразумевалось, но не было отражено в таблицах: коллекции, категории поставщиков, историю закупочных цен, экспорт/отгрузку и документооборот по партии. Результат:

| Изменение | Было | Стало | Почему |
|---|---|---|---|
| Добавлена `collections` | — | Новая сущность, `products.collection_id` | Модели группируются в сезонные коллекции («Осень 2026») — базовая единица планирования ассортимента, отсутствовала полностью |
| Расширены `suppliers` | `type` implicit (только материалы) | `type`: `fabric / trim / packaging / logistics` | Поставщики упаковки и транспортные компании — тоже поставщики, но не материалов на модель; нужна категоризация для отчётов и фильтрации |
| Расширены `materials` | `type`: `fabric/trim/accessory` | `type`: `fabric/trim/packaging/accessory` | Упаковка — тоже материал с расходом и остатком |
| Расширены `purchase_orders` | `expected_date` (план поставки) | + `ordered_at` (дата фактического размещения заказа) | Нужна отдельная от `expected_date` и от системного `created_at` бизнес-дата — основа для истории цен («Оксфорд 280 → март 270 → апрель 295 → июнь 320») |
| **История закупочных цен — не новая таблица** | — | Производный отчёт: `purchase_order_items.unit_price` + `purchase_orders.ordered_at` + `supplier_id`, сгруппировано по `material_id` | Дублировать цену в отдельную таблицу — нарушить принцип «данные как источник истины» (`PRINCIPLES.md`, №12): цена уже есть в позиции заказа, второе хранилище только создаёт риск рассинхронизации. Отчёт/материализованное представление — задача Reporting/BI (Фаза 2-3), не новая таблица сейчас |
| Расширены `warehouses` | `type`: `own/workshop/marketplace_fbo/consignment` | + `country` (текст/ISO) | Собственные склады физически могут быть в разных странах (склад в стране пошива и склад в стране продаж) — нужно для отчётности и для секции 10 (отгрузки/экспорт) |
| Добавлены `shipments`, `shipment_items` | — | Новые сущности | Экспорт/доставка между складами — по явному указанию владельца моделируется как простая сущность отгрузки, **не** полноценный таможенный модуль (декларации и т.п. прикрепляются как документы, см. ниже) |
| Добавлены `documents`, `notes` | — | Новые полиморфные сущности (`entity_type` + `entity_id`) | Открыть партию/заказ/отгрузку и сразу увидеть инвойс, договор, накладную, фото, сертификаты, декларацию, доп. соглашение к спецификации, а также произвольные заметки — раньше было негде хранить |

**Профиль/маржа не хранится отдельной таблицей** — это вычисляемая метрика (выручка из `orders`/`order_items` минус `cost_entries` минус `logistics_cost`), принадлежит модулю Reporting/BI как read-model, не доменной таблице (см. `ARCHITECTURE.md`, модуль Reporting/BI).

Все остальные таблицы прошли повторную проверку без изменений.

## 1. Сквозные конвенции

- **Именование таблиц**: `snake_case`, множественное число (`products`, `stock_items`).
- **Первичные ключи**: `id UUID DEFAULT gen_random_uuid()` — UUID вместо serial, чтобы избежать угадываемых ID во внешних интеграциях (маркетплейсы видят наши ID через API) и упростить будущий шардинг.
- **Мультитенантность**: каждая «корневая» доменная таблица модуля содержит `company_id UUID NOT NULL REFERENCES companies(id)`. Строки-детали, которые существуют только в контексте родителя (`bom_items`, `purchase_order_items`, `product_variants`, `stock_items`, `stock_movements`, `order_items` и т.п. — везде, где в описании таблицы ниже `company_id` не перечислен), наследуют тенант через FK на родителя, а не дублируют колонку — родитель уже отфильтрован по `company_id`, повторение было бы избыточной денормализацией без выгоды. Все запросы приложения обязаны фильтровать по `company_id` (обеспечивается на уровне application layer + композитные индексы `(company_id, ...)`; путь к PostgreSQL Row-Level Security открыт на будущее).
- **Аудит-поля** на каждой таблице: `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `created_by UUID REFERENCES users(id)`.
- **Бизнес-даты отделены от системных**: `created_at` — когда запись появилась в БД; бизнes-событие (когда заказ реально размещён, когда отгрузка реально ушла) хранится отдельным полем (`ordered_at`, `shipped_at` и т.п.) — они могут не совпадать (запись вносят в систему позже факта).
- **Мягкое удаление** для справочников и документов с историей (`deleted_at TIMESTAMPTZ NULL`) — обязательно для `products`, `product_variants`, `materials`, `orders` и т.д.; физическое удаление запрещено для сущностей с финансовым/комплаенс-следом (коды маркировки, проводки).
- **Деньги**: тип `numeric(14,2)` (никогда `float`), валюта фиксируется на уровне компании (мультивалютность — вне скоупа MVP).
- **Количества (SKU)**: `numeric(12,3)` — учитывает как штучный товар, так и материалы, которые могут измеряться в метрах/килограммах с дробной частью.
- **Внешние ID** (ID заказа в WB, ID SKU в Ozon и т.д.) хранятся рядом с нашим ID как `external_id text`, не заменяют собственный PK.
- **Полиморфные связи** (`documents`, `notes`): `entity_type text` + `entity_id UUID` вместо отдельной таблицы/FK на каждую комбинацию. Осознанный компромисс — теряется ссылочная целостность на уровне БД (нельзя `REFERENCES` на переменную таблицу), проверка `entity_type`/существования `entity_id` — на уровне application layer. Выбрано, чтобы не плодить `production_order_documents`, `purchase_order_documents`, `shipment_documents`, ... — по одной таблице на каждую пару. Пересмотреть, если реальные проблемы с целостностью данных проявятся на практике (принцип эволюционной архитектуры, `PRINCIPLES.md` №3).

## 2. ER-диаграмма (укрупнённо)

```mermaid
erDiagram
    COMPANIES ||--o{ USERS : has
    COMPANIES ||--o{ WAREHOUSES : has
    COMPANIES ||--o{ COLLECTIONS : has
    COMPANIES ||--o{ PRODUCTS : owns
    COMPANIES ||--o{ SUPPLIERS : has
    COMPANIES ||--o{ WORKSHOPS : has
    COMPANIES ||--o{ MARKETPLACE_ACCOUNTS : has

    COLLECTIONS ||--o{ PRODUCTS : groups
    PRODUCTS ||--o{ PRODUCT_VARIANTS : "size x color"
    PRODUCTS ||--o{ BOM : specification
    BOM ||--o{ BOM_ITEMS : contains
    BOM_ITEMS }o--|| MATERIALS : uses

    SUPPLIERS ||--o{ PURCHASE_ORDERS : receives
    PURCHASE_ORDERS ||--o{ PURCHASE_ORDER_ITEMS : contains
    PURCHASE_ORDER_ITEMS }o--|| MATERIALS : orders

    WORKSHOPS ||--o{ PRODUCTION_ORDERS : "заказ пошива"
    PRODUCTS ||--o{ PRODUCTION_ORDERS : specified_as
    PRODUCTION_ORDERS ||--o{ PRODUCTION_ORDER_VARIANTS : "разбивка по SKU"

    WAREHOUSES ||--o{ STOCK_ITEMS : holds
    PRODUCT_VARIANTS ||--o{ STOCK_ITEMS : tracked_as
    STOCK_ITEMS ||--o{ STOCK_MOVEMENTS : history
    WORKSHOPS ||--o| WAREHOUSES : "WIP-локация (type=workshop)"

    WAREHOUSES ||--o{ SHIPMENTS : "origin/destination"
    SHIPMENTS ||--o{ SHIPMENT_ITEMS : contains
    PRODUCT_VARIANTS ||--o{ SHIPMENT_ITEMS : moved_as
    SUPPLIERS ||--o{ SHIPMENTS : "перевозчик (type=logistics)"

    PRODUCT_VARIANTS ||--o{ MARKING_CODES : labeled_with
    MARKING_CODES ||--o{ MARKING_CODE_EVENTS : status_history

    MARKETPLACE_ACCOUNTS ||--o{ MARKETPLACE_LISTINGS : lists
    PRODUCT_VARIANTS ||--o{ MARKETPLACE_LISTINGS : mapped_to

    ORDERS ||--o{ ORDER_ITEMS : contains
    PRODUCT_VARIANTS ||--o{ ORDER_ITEMS : sold_as
    SALES_CHANNELS ||--o{ ORDERS : source

    ORDERS ||--o{ COST_ENTRIES : generates
    PRODUCTION_ORDERS ||--o{ COST_ENTRIES : generates

    PRODUCTION_ORDERS ||--o{ DOCUMENTS : "инвойс/накладная/фото/сертификаты"
    PURCHASE_ORDERS ||--o{ DOCUMENTS : "инвойс/договор"
    SHIPMENTS ||--o{ DOCUMENTS : "CMR/накладная/декларация"
    PRODUCTION_ORDERS ||--o{ NOTES : comments
```

## 3. Жизненный цикл товара (процесс) — от коллекции до прибыли

> Это не ER-диаграмма (не все узлы — таблицы; «Прибыль» — вычисляемая метрика), а иллюстрация того, как таблицы из разделов 4-15 складываются в реальный бизнес-процесс. Именно эта цепочка должна быть проверяемо отражена в БД — см. таблицу соответствия под диаграммой.

```mermaid
flowchart TD
    COL["Коллекция<br/>«Осень 2026»<br/>(collections)"] --> PROD["Модель<br/>«Петроль»<br/>(products)"]
    PROD --> VARIANT["Цвет × Размер = SKU<br/>(product_variants)"]
    PROD --> BOMT["Спецификация<br/>(boms/bom_items)"]
    BOMT --> MATF["Материал: ткань<br/>(materials, type=fabric)"]
    BOMT --> MATT["Материал: фурнитура<br/>(materials, type=trim)"]
    MATF --> SUPF["Поставщик ткани<br/>(suppliers, type=fabric)"]
    MATT --> SUPT["Поставщик фурнитуры<br/>(suppliers, type=trim)"]
    SUPF --> PORD["Закупка<br/>(purchase_orders/_items,<br/>ordered_at → история цен)"]
    SUPT --> PORD
    PORD --> RECMAT["Поставка ткани на свой склад<br/>(stock_movements: receipt)"]
    RECMAT --> TRANS["Передача в цех<br/>(stock_movements: transfer →<br/>склад-у-цеха, warehouses.type=workshop)"]
    TRANS --> WORD["Заказ в цех<br/>(production_orders, workshop_id,<br/>agreed_unit_price)"]
    WORD --> RECGOOD["Приёмка готовой продукции<br/>(stock_movements: receipt<br/>на собственный склад)"]
    RECGOOD --> STOCK["Остатки<br/>(stock_items)"]
    STOCK --> SHIP["Отгрузка / экспорт<br/>(shipments, shipment_items)"]
    SHIP --> STOCK2["Остатки на складе назначения<br/>(stock_items, warehouses.country)"]
    STOCK2 --> MP["Wildberries / Ozon<br/>(marketplace_listings)"]
    STOCK --> MP
    MP --> SALE["Продажа<br/>(orders/order_items)"]
    SALE --> COST["Себестоимость заказа<br/>(cost_entries: material+manufacturing+logistics+overhead)"]
    COST --> PROFIT["Прибыль<br/>(revenue − cost_entries,<br/>read-model Reporting/BI —<br/>не отдельная таблица)"]

    WORD -.документы/фото.-> DOCS["documents: инвойс, договор,<br/>накладная, сертификаты, фото"]
    PORD -.документы.-> DOCS
    SHIP -.документы.-> DOCS2["documents: CMR/накладная,<br/>декларация"]
    WORD -.заметки.-> NOTES["notes: комментарии по заказу"]
```

**Проверка соответствия** (пункт задачи «эта цепочка должна быть отражена в БД»):

| Шаг из бизнес-процесса | Таблица(ы) | Статус |
|---|---|---|
| Коллекция | `collections` | Добавлено в этом проходе |
| Модель → Ткань → Фурнитура | `products`, `boms`, `bom_items`, `materials` | Было |
| Поставщик | `suppliers` (+ `type`) | Категоризация добавлена в этом проходе |
| Закупка | `purchase_orders`, `purchase_order_items` (+ `ordered_at`) | `ordered_at` добавлено в этом проходе |
| Поставка ткани (на свой склад) | `stock_movements` (`type=receipt`) | Было |
| Передача ткани в цех | `stock_movements` (`type=transfer`, склад `type=workshop`) | Было (прошлый аудит) |
| Заказ в цех | `production_orders`, `production_order_variants` | Было (прошлый аудит) |
| Приёмка (готовой продукции) | `stock_movements` (`type=receipt`, ссылка на `production_order_id`) | Было |
| Склад | `warehouses` (+ `country`), `stock_items` | `country` добавлено в этом проходе |
| Экспорт | `shipments`, `shipment_items` | Добавлено в этом проходе |
| Wildberries / Ozon | `marketplace_listings`, `marketplace_accounts` | Было |
| Продажи | `orders`, `order_items` | Было |
| Прибыль | вычисляется из `orders` + `cost_entries` | Read-model, не таблица |

## 4. Identity & Access

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `companies` | `id`, `name`, `legal_name`, `inn`, `timezone`, `default_currency` | Тенант. Корень мультитенантности |
| `users` | `id`, `company_id`, `email`, `password_hash`, `full_name`, `is_active` | Пользователь всегда принадлежит компании |
| `roles` | `id`, `company_id NULL` (глобальные роли) или `company_id` (кастомные), `name`, `code` | Предустановленные роли — см. `PROJECT_VISION.md` (бренд/селлер, не производитель) |
| `permissions` | `id`, `code` (например, `warehouse.stock.write`), `module` | Гранулярные права по модулю/действию |
| `role_permissions` | `role_id`, `permission_id` | Многие-ко-многим |
| `user_roles` | `user_id`, `role_id` | Пользователь может иметь несколько ролей (актуально для малых команд) |

## 5. Catalog

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `collections` | `id`, `company_id`, `name` (например, «Осень 2026»), `season` (`spring/summer/autumn/winter` NULL), `year`, `status` (`planning/active/archived`) | **Новая сущность.** Сезонная коллекция — единица планирования ассортимента, группирует модели |
| `products` | `id`, `company_id`, `collection_id NULL`, `name`, `code` (артикул модели), `category`, `season`, `status` (`draft/active/discontinued`), `tech_pack_url` | Модель одежды на уровне абстракции, без размера/цвета. `collection_id` — nullable: не каждая модель обязана входить в формальную коллекцию. `tech_pack_url` — ссылка на текущий файл спецификации (через `StorageAdapter`); архив версий/доп. соглашений — через `documents` (см. п.15) |
| `product_variants` | `id`, `product_id`, `size`, `color`, `sku_code` (уникальный внутри компании), `barcode` (EAN/GTIN) | Конкретный SKU — единица учёта остатков и продаж |

## 6. Materials & Procurement

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `materials` | `id`, `company_id`, `name`, `type` (`fabric/trim/packaging/accessory`), `unit` (`m/kg/pcs`), `reorder_point` | Ткани, фурнитура, упаковка и прочие материалы. `packaging` добавлен в этом проходе |
| `suppliers` | `id`, `company_id`, `name`, `type` (`fabric/trim/packaging/logistics`), `inn`, `contact_info` | Поставщики — теперь явно категоризированы, включая транспортные компании (`logistics`, используются как `shipments.carrier_id`). Один поставщик = одна основная категория для MVP; поставщик нескольких категорий заводится отдельными строками при необходимости (не усложняем до реальной необходимости) |
| `purchase_orders` | `id`, `company_id`, `supplier_id`, `status` (`draft/sent/partially_received/received/cancelled`), `ordered_at`, `expected_date` | Заявка/заказ поставщику материалов. `ordered_at` — дата фактического размещения заказа (бизнес-дата, отдельно от `created_at`) — основа для истории цен |
| `purchase_order_items` | `id`, `purchase_order_id`, `material_id`, `quantity`, `unit_price` | Позиции заказа. **История закупочных цен по материалу** — не отдельная таблица, а отчёт/представление: `unit_price` этой таблицы + `ordered_at`/`supplier_id` родительского `purchase_orders`, сгруппированные по `material_id` (см. п.0b) |

## 7. BOM (спецификации)

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `boms` | `id`, `company_id`, `product_id`, `version`, `status` (`draft/approved/archived`) | Спецификация версионируется — изменение нормы расхода не должно портить историю уже размещённых заказов у цехов |
| `bom_items` | `id`, `bom_id`, `material_id`, `quantity_per_unit`, `waste_percent` | Норма расхода материала на единицу модели с учётом отхода — основа для расчёта, сколько ткани/фурнитуры передать цеху под заказ (давальческая схема), и для себестоимости |

~~`tech_specs`~~ — удалена по итогам первого аудита (п.0): моделировала операции пошива с нормо-минутами, применимо только к штатным швеям.

## 8. Contract Manufacturing (заказы в подрядных швейных цехах)

> Мы не производим — мы размещаем и контролируем заказы у независимых подрядчиков (см. п.0).

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `workshops` | `id`, `company_id`, `name`, `inn`, `contact_info`, `specialization`, `is_active` | Независимый подрядный швейный цех — поставщик услуги пошива, не материалов |
| `production_orders` | `id`, `company_id`, `product_id`, `bom_id`, `workshop_id`, `planned_quantity`, `agreed_unit_price`, `materials_provided_by_us` (bool), `status` (`placed/in_progress/ready_for_pickup/received/cancelled`), `due_date` | Заказ пошива у конкретного цеха по согласованной цене за единицу. `status` — простое поле вместо отдельной таблицы стадий |
| `production_order_variants` | `production_order_id`, `product_variant_id`, `quantity` | Разбивка заказа по размеру/цвету (SKU) |

**Не в MVP, возможно в Future**: `production_batches` — если появится потребность дробить один заказ на несколько независимо отслеживаемых партий поставки.

**Не проектируется вовсе**: детальная стадийность («крой», «пошив», «ОТК») с привязкой к ответственному сотруднику — операционная модель штатного цеха, которого нет.

## 9. Warehouse & Inventory

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `warehouses` | `id`, `company_id`, `name`, `type` (`own/workshop/marketplace_fbo/consignment`), `country`, `workshop_id NULL` | `country` добавлен в этом проходе — собственные склады могут физически находиться в разных странах (склад в стране пошива и склад в стране продаж), это основа для секции 10 (отгрузки). `type=workshop` (+`workshop_id`) — WIP-локация у подрядчика для давальческого сырья |
| `stock_items` | `id`, `warehouse_id`, `product_variant_id`, `quantity_on_hand`, `quantity_reserved` | Текущий остаток по SKU на складе |
| `stock_movements` | `id`, `stock_item_id`, `type` (`receipt/dispatch/adjustment/transfer`), `quantity`, `reference_type`, `reference_id`, `occurred_at` | Полная история движений — источник истины. `dispatch` — окончательный исход со склада конечному покупателю (продажа); движение между двумя нашими складами (в т.ч. отгрузка/экспорт из п.10) — `transfer`, во избежание путаницы с сущностью `shipments` (переименовано в этом проходе: было `shipment`, теперь `dispatch`) |
| `inventory_counts` | `id`, `warehouse_id`, `status`, `performed_by`, `performed_at` | Инвентаризация — в первую очередь для собственных складов |
| `inventory_count_items` | `inventory_count_id`, `product_variant_id`, `expected_quantity`, `actual_quantity`, `discrepancy` | Расхождения факта и учёта — метрика успеха проекта (см. `PROJECT_VISION.md`, критерий 1) |

## 10. Logistics & Export (отгрузки)

> Часть модуля Warehouse & Inventory (не отдельный bounded context — экспорт технически является перемещением между складами с дополнительными логистическими атрибутами). По явному решению владельца — **простая сущность отгрузки для MVP, не полноценный таможенный модуль**: декларации и прочие таможенные документы прикрепляются как файлы через `documents` (п.15), а не моделируются структурированными полями.

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `shipments` | `id`, `company_id`, `origin_warehouse_id`, `destination_warehouse_id`, `carrier_id NULL` (FK `suppliers`, `type=logistics`), `status` (`planned/in_transit/customs_clearance/delivered/cancelled`), `tracking_number NULL`, `shipped_at NULL`, `delivered_at NULL` | Отгрузка/экспорт между **нашими** складами (например, склад в стране пошива → склад в стране продаж) — оба склада наши, значит движение остатков отражается через `stock_movements` с `type='transfer', reference_type='shipment', reference_id=shipments.id` (не `dispatch` — товар не покидает компанию) |
| `shipment_items` | `shipment_id`, `product_variant_id`, `quantity` | Что именно едет в этой отгрузке — по SKU |

## 11. Sales & Orders

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `sales_channels` | `id`, `company_id`, `type` (`marketplace/wholesale/retail/own_website`), `name` | Унифицированный источник продажи. MVP: только `marketplace` (Wildberries) |
| `orders` | `id`, `company_id`, `sales_channel_id`, `external_order_id`, `status`, `total_amount`, `ordered_at` | Единый заказ независимо от канала |
| `order_items` | `id`, `order_id`, `product_variant_id`, `quantity`, `unit_price` | Позиции заказа |

## 12. Marketplace Integration

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `marketplaces` | `id`, `code` (`wildberries/ozon/yandex_market`), `name` | Справочник поддерживаемых площадок |
| `marketplace_accounts` | `id`, `company_id`, `marketplace_id`, `api_credentials_encrypted`, `is_active` | Личный кабинет продавца компании на площадке |
| `marketplace_listings` | `id`, `marketplace_account_id`, `product_variant_id`, `external_sku_id`, `current_price`, `current_stock_reported` | Связка нашего SKU с карточкой на площадке |
| `marketplace_sync_logs` | `id`, `marketplace_account_id`, `sync_type`, `status`, `started_at`, `finished_at`, `error_details` | Наблюдаемость интеграций |

## 13. Honest Sign (Честный Знак)

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `marking_codes` | `id`, `company_id`, `product_variant_id`, `code_value` (DataMatrix), `status` (`issued/applied/introduced/sold/retired/damaged`), `production_order_id NULL` | Код маркировки — обязанность лежит на нас как на продавце/импортёре |
| `marking_code_events` | `id`, `marking_code_id`, `event_type`, `occurred_at`, `reference_type`, `reference_id`, `payload_json` | История статусов для аудита перед ГИС МТ |

## 14. Finance

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `cost_entries` | `id`, `company_id`, `product_variant_id`, `production_order_id NULL`, `material_cost`, `manufacturing_cost`, `logistics_cost`, `overhead_cost`, `calculated_at` | Себестоимость единицы: материалы + `manufacturing_cost` (услуга цеха) + `logistics_cost` (доставка/экспорт) + накладные |
| `transactions` | `id`, `company_id`, `type` (`income/expense`), `amount`, `reference_type`, `reference_id`, `occurred_at` | Движение денег для управленческого учёта |
| `invoices` | `id`, `company_id`, `order_id NULL`, `purchase_order_id NULL`, `production_order_id NULL`, `status`, `amount`, `due_date` | Документы к оплате/получению — счета от поставщиков материалов и от подрядных цехов |

**Прибыль/маржа** — не хранится: вычисляется как `orders.total_amount` (выручка) минус связанные `cost_entries` минус прочие расходы периода. Это read-model Reporting/BI, не таблица (см. п.0b).

## 15. Общие/сквозные

| Таблица | Ключевые поля | Комментарий |
|---|---|---|
| `audit_log` | `id`, `company_id`, `user_id`, `entity_type`, `entity_id`, `action`, `before_json`, `after_json`, `occurred_at` | Системный аудит критичных операций (см. `ARCHITECTURE.md` п.7) — **не путать** с `notes` ниже: это автоматический след изменений полей, не текст от пользователя |
| `notifications` | `id`, `company_id`, `user_id`, `type`, `payload_json`, `read_at` | Уведомления (низкий остаток, срыв срока заказа у цеха и т.д.) |
| `documents` | `id`, `company_id`, `entity_type` (`production_order/purchase_order/shipment/bom/workshop/supplier`), `entity_id`, `doc_type` (`invoice/contract/waybill/photo/certificate/specification/declaration/addendum/other`), `file_url`, `title NULL`, `issued_at NULL`, `uploaded_by` | **Новая сущность.** Открыть заказ/партию/отгрузку и увидеть инвойс, договор, накладную (в т.ч. международную), фотографии, сертификаты, декларацию, доп. соглашение к спецификации. `file_url` — через `StorageAdapter` (см. `INFRASTRUCTURE.md` п.2.3) |
| `notes` | `id`, `company_id`, `entity_type`, `entity_id`, `author_id` (FK `users`), `body`, `created_at` | **Новая сущность.** Свободный текстовый комментарий к любой сущности («цех попросил перенести срок на 3 дня») — в отличие от `documents` (файл) и `audit_log` (автоматический след) |

## 16. Индексация — базовые правила

- Композитный индекс `(company_id, id)` или включение `company_id` первым полем в любой составной индекс — так как фильтрация по тенанту присутствует в каждом запросе.
- `stock_items`: уникальный индекс `(warehouse_id, product_variant_id)`.
- `marking_codes.code_value`: уникальный индекс (глобально уникален по природе DataMatrix-кода).
- `order_items`, `stock_movements`: индекс по `occurred_at`/`ordered_at` для отчётных запросов по периодам.
- `marketplace_listings`: уникальный индекс `(marketplace_account_id, external_sku_id)`.
- `warehouses`: `workshop_id` обязателен, когда `type = 'workshop'`, и NULL иначе (проверяется на уровне application layer или CHECK-constraint).
- `purchase_orders`: индекс `(supplier_id, ordered_at)` — основа отчёта истории цен (п.0b, 6).
- `purchase_order_items`: индекс `(material_id)` — для отчёта истории цен в разрезе материала.
- `documents`, `notes`: индекс `(company_id, entity_type, entity_id)` — быстрая выборка «всё по этому заказу/отгрузке».
- `shipments`: индекс `(company_id, status)`, `(destination_warehouse_id)`.
- `collections`: уникальный индекс `(company_id, name)`.

## 17. Миграции

- Управляются через Drizzle Kit, миграции — часть `packages/db-schema`, версионируются в git, применяются в CI перед деплоем (см. `QUALITY_STANDARDS.md`).
- Правило: миграция, ломающая обратную совместимость (удаление колонки, NOT NULL без дефолта на непустой таблице), разбивается на два релиза (expand → migrate data → contract), а не выполняется одним шагом на проде.

## 18. Открытые вопросы по схеме

Вынесены в [`ARCHITECTURE_SELF_REVIEW.md`](./ARCHITECTURE_SELF_REVIEW.md): партиционирование `stock_movements`/`marking_code_events` по мере роста, стратегия RLS вместо application-level фильтрации по `company_id`, схема хранения `api_credentials_encrypted` (KMS vs application-level шифрование).

**Закрыт этим проходом**: моделирование экспорта — решено как простая сущность `shipments` (п.10), не таможенный модуль.

**Новый вопрос (не блокирует Итерацию 2)**: если один поставщик реально продаёт материалы нескольких категорий (например, ткань и фурнитуру одновременно), заводить ли его несколькими строками в `suppliers` или переходить на `supplier_categories` (многие-ко-многим)? Для MVP — несколько строк (проще); пересмотреть, если на практике это создаст путаницу в отчётах.
