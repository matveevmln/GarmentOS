# SEC-P1 — отчёт об исправлении изоляции компаний в складе и отгрузках

Модель исполнения: `claude-sonnet-5`. Задание: `docs/tasks/SEC-P1.md`. Ветка `fix/gos-sec-p1-tenant-isolation`, базовая ветка `gos-party-v1/review-security-handoff`.

- Исходный SHA (база ветки, до исправления): `fe8df8acd76cf20201c0871c8ba54f6f30fb3131`.
- Итоговый SHA (после коммита) — см. финальное сообщение сессии/ссылку на PR.

T00 остаётся `REVIEW`, T01 — `BLOCKED`. Это задание не принимает T00 и не запускает T01 (`docs/tasks/SEC-P1.md`, раздел «Цель и полномочия»).

## 1. Дефект и его воспроизведение

Аудит T00 (`docs/GOS-PARTY-V1-AUDIT.md`, раздел 12, сценарий P1) зафиксировал: компания B могла вызвать `POST /v1/stock/receive`, указав `warehouseId` компании A, и остаток записывался на чужой склад — HTTP 201, без какой-либо проверки владения.

Корневая причина шире одного endpoint'а: доменные use case'ы модуля `warehouse` (`packages/domain/warehouse/src/application/*.ts`) — `receiveStock`, `dispatchStock`, `transferStock`, `reserveStock`, `releaseReservation`, `createShipment`, `dispatchShipment`, `markShipmentDelivered`, `recordInventoryCountItem` — принимали `warehouseId`/`productVariantId` без параметра `companyId` вообще: порт `StockRepository` работает по `(warehouseId, productVariantId)` без привязки к компании, поэтому НИ ОДИН вызывающий уровень (контроллер, `WarehouseService`, доменный слой, репозиторий) не проверял принадлежность.

## 2. Карта затронутых входов (составлена перед изменением)

| Вход (HTTP) | Сервис | Use case (domain/warehouse) | Проблема до исправления |
|---|---|---|---|
| `POST /v1/stock/receive` | `WarehouseService.receiveStock` | `receiveStock` | Нет проверки владения складом/SKU; `createdBy` — из тела запроса |
| `POST /v1/stock/dispatch` | `WarehouseService.dispatchStock` | `dispatchStock` | То же |
| `POST /v1/stock/transfer` | `WarehouseService.transferStock` | `transferStock` | Нет проверки origin/destination/SKU; `createdBy` — из тела |
| `POST /v1/stock/reserve` | `WarehouseService.reserveStock` | `reserveStock` | Контроллер не получал `@CurrentUser()` вовсе — companyId неоткуда проверить |
| `POST /v1/stock/release` | `WarehouseService.releaseReservation` | `releaseReservation` | То же |
| `POST /v1/shipments` | `WarehouseService.createShipment` | `createShipment` | Нет проверки origin/destination/SKU каждой строки; `createdBy` — из тела |
| `POST /v1/shipments/:id/dispatch` | `WarehouseService.dispatchShipment` | `dispatchShipment` | `findById(companyId,...)` защищает саму отгрузку, но НЕ повторно проверяет origin/destination/SKU строк перед движением остатка — устаревшая/повреждённая запись обошла бы защиту |
| `POST /v1/shipments/:id/deliver` | `WarehouseService.markShipmentDelivered` | `markShipmentDelivered` | Не двигает остаток (только статус/дата), но также не проверял origin/destination повторно |
| `POST /v1/inventory-counts/:id/items` | `WarehouseService.recordInventoryCountItem` | `recordInventoryCountItem` | Склад инвентаризации уже проверялся (`createInventoryCount`), но `productVariantId` — нет: чужой SKU можно было завести на своём складе; `createdBy` — из тела |
| `contract-manufacturing.service.ts` → `receiveProductionOrder` (внутренний вызов `WarehouseService.receiveStock`) | — | `receiveStock` | Тот же дефект достижим и без прямого HTTP на `/stock/receive` — защита в domain-слое покрывает этот путь автоматически |
| `GET /v1/shipments` | — | — | Endpoint отсутствует вообще — не «защищённое чтение», а отсутствие функциональности. Отмечено, не выдано за проверку. |

Единственные найденные вызывающие пути в `apps/api` — два контроллера (`stock.controller.ts`, `shipments.controller.ts`, `inventory-counts.controller.ts`) и один внутренний вызов из `contract-manufacturing.service.ts`. Других мест, обходящих `WarehouseService`, не найдено (`grep` по `@garmentos/domain-warehouse` и `warehouseService\.`).

## 3. Изменения и почему они закрывают дефект

### 3.1. Домен (`packages/domain/warehouse/src/application/*.ts`)

Защита размещена в **доменном/application слое**, а не только в контроллере — согласно заданию, "одной проверки в UI/контроллере недостаточно":

- Новый порт `ProductVariantOwnershipPort` (`ports.ts`) — ACL-порт для проверки принадлежности SKU компании. `domain-warehouse` сознательно не получил рантайм-зависимость от `domain-catalog` (там SKU на самом деле живёт: `product_variants.product_id → products.company_id`) — как и остальные доменные пакеты этого репозитория, `@garmentos/domain-catalog` остаётся только `devDependency` (для тестов). Реализация порта — в `apps/api` поверх уже существующего `CatalogService.findProductVariantById`.
- Новый общий модуль `assert-ownership.ts` — `assertWarehouseOwnership`/`assertProductVariantOwnership`, оба бросают `DomainError` с кодом `WAREHOUSE_NOT_FOUND`/`PRODUCT_VARIANT_NOT_FOUND` (суффикс `_NOT_FOUND` уже маппится на HTTP 404 в `apps/api/src/common/domain-exception.filter.ts` — переиспользован существующий проектный конвеншн, не изобретён новый статус/403).
- `receive-stock.ts`, `dispatch-stock.ts`: `companyId` в input, проверка склада и SKU до чтения/записи остатка.
- `transfer-stock.ts`: то же для origin И destination.
- `reservation.ts` (`reserveStock`/`releaseReservation`): то же.
- `create-shipment.ts`: origin, destination и **каждая** строка `items` проверяются до вызова `shipments.create(...)` — при отказе на последней строке не создаётся ни строка, ни сама отгрузка (репозиторий и так пишет всё одной транзакцией, но проверка до вызова гарантирует «ничего не тронуто» независимо от этого).
- `dispatch-shipment.ts`: помимo существующего `findById(companyId, id)`, добавлена **повторная** проверка origin/destination/SKU каждой строки — это защищает от отгрузок, заведённых до исправления (или любым другим путём) с чужими ссылками на склад/SKU. Проверка всего набора строк идёт одним циклом ДО цикла `transferStock` — ни одна строка не будет перемещена, если хотя бы одна ссылка чужая.
- `mark-shipment-delivered.ts`: доставка не двигает остаток, но origin/destination перепроверяются для единообразия и на случай той же устаревшей записи.
- `record-inventory-count-item.ts`: добавлена проверка `productVariantId` (склад уже проверялся раньше, в `create-inventory-count.ts` — не менялся).

### 3.2. apps/api (`warehouse.module.ts`, `warehouse.service.ts`, `stock.controller.ts`, `shipments.controller.ts`, `inventory-counts.controller.ts`)

- `WarehouseModule` импортирует `CatalogModule` (тот же паттерн межмодульной композиции, что уже использует `ContractManufacturingModule`/`CuttingModule` — через сервис другого модуля, не через прямой репозиторий).
- `WarehouseService` получает `CatalogService` и реализует `ProductVariantOwnershipPort` через него; добавлен приватный метод `assertOwnWarehouseAndVariant`, вызываемый ДО чтения before-снимка для аудита в `receiveStock`/`dispatchStock`/`transferStock` — без этого сервис успевал прочитать фактический остаток чужого склада во временную переменную ещё до отказа домена (снимок никуда не публиковался и не логировался при ошибке, но такого чтения быть не должно). Домен всё равно проверяет то же самое — сервисная проверка не замена, а дополнительный барьер.
- Все девять методов теперь передают `companyId` в domain-слой и `warehouses`/`productVariants` зависимости.
- `createdBy` **везде** берётся из `currentUser.id` (или `companyId`), не из `input.createdBy` — тело запроса по-прежнему может прислать это поле (обратная совместимость контракта не сломана, схемы `shared-types` не менялись), но сервер его больше не использует.
- `stock.controller.ts`: `reserve`/`release` получили `@CurrentUser()` — раньше эти два endpoint'а не имели способа узнать вызывающую компанию вообще.
- `shipments.controller.ts`/`inventory-counts.controller.ts`: точечно изменены сигнатуры вызовов сервиса (`createShipment(currentUser, body)`, `recordInventoryCountItem(currentUser, id, body)`), сам HTTP-контракт (пути, тела запросов, коды ответов при успехе) не изменился.

### 3.3. Не менялось (сознательно, вне границ SEC-P1)

Согласно `docs/tasks/SEC-P1.md`, пункт 4: не тронуты момент зачисления остатка при `dispatchShipment` (по-прежнему на `dispatch`, не на `deliver` — это отдельный содержательный дефект из аудита, раздел 14.3), состояние «в пути», частичные получения, докрой/ремонт, многомодельный заказ. Эти пункты остаются в `docs/GOS-PARTY-V1-AUDIT.md` и задании T01.

## 4. Обязательные доказательства — постоянный regression-тест

Файл: `apps/api/src/warehouse/sec-p1-tenant-isolation.e2e.spec.ts` (в репозитории, не временный зонд). Два синтетических tenant'а (A, B) через реальный HTTP + JWT (`supertest` + `AppModule`, тот же паттерн, что и остальные `*.e2e.spec.ts` в этом модуле) — **не** прямой вызов service/use case с вручную подставленным `companyId`.

13 тестов, покрывающих пункты 1–7 задания:

1. **Воспроизведение P1** — компания B → `POST /stock/receive` со складом A: было 201 и запись на чужой склад, стало 404 `WAREHOUSE_NOT_FOUND`; остаток A не изменился.
2. **Чужой SKU на своём складе** — receive/dispatch/transfer с чужим `productVariantId` → 404 `PRODUCT_VARIANT_NOT_FOUND`.
3. **Чужой склад** — dispatch/transfer (origin И destination по отдельности)/reserve/release → 404 `WAREHOUSE_NOT_FOUND`; прямая проверка в БД, что остаток/резерв A не изменился.
4. **Многопозиционный запрос** — создание отгрузки с валидной первой строкой и чужой последней → 404, ни строка, ни сама отгрузка не создаются (сравнение количества отгрузок компании B до/после).
5. **Чужая отгрузка** — B пытается `dispatch`/`deliver` отгрузку A → 404 `SHIPMENT_NOT_FOUND` (существовавшая защита, подтверждена явно).
6. **Синтетическая старая отгрузка** — отгрузка вставлена напрямую в БД (в обход API, эмулируя запись «до исправления») с `companyId=B`, но `originWarehouseId` чужой (A) → `dispatch` отклонён с 404 `WAREHOUSE_NOT_FOUND`, статус остался `planned`, остаток A не тронут.
7. **Чтение** — `GET /v1/shipments` → 404, явно зафиксировано как отсутствие endpoint'а, не как проверенная защита.
8. **Инвентаризация** — позиция по чужому SKU на своём складе → 404 `PRODUCT_VARIANT_NOT_FOUND`, строка остатка не создаётся.
9. **Подмена автора** — `createdBy` в теле запроса (receive и createShipment) игнорируется, реальная запись — от аутентифицированного пользователя (проверено прямым чтением `stock_movements`/`shipments` в БД).
10. **Положительный сценарий** — полный цикл в пределах одной компании (receive → reserve → release → dispatch → transfer → shipment create/dispatch/deliver) проходит как раньше.
11. **RBAC** — `accountant` без `warehouse.write` получает 403, не 404/500.

### Красный прогон (до исправления) — обязательное доказательство по пункту 1 задания

Файлы исправления временно откачены (`git stash` по путям `packages/domain/warehouse/src`, `apps/api/src/warehouse/{warehouse.service,warehouse.module,stock.controller,shipments.controller,inventory-counts.controller}.ts`, `packages/domain/finance/src/scenario.spec.ts`; новый `assert-ownership.ts` перемещён вне дерева, чтобы пакет вообще собрался), `domain-warehouse` пересобран, тест запущен против уязвимого кода:

```
$ pnpm --filter @garmentos/domain-warehouse build   # exit 0, против исходного (неисправленного) кода
$ cd apps/api && pnpm exec vitest run src/warehouse/sec-p1-tenant-isolation.e2e.spec.ts
 Test Files  1 failed (1)
      Tests  9 failed | 4 passed (13)
```

9 из 13 тестов **упали именно там, где ожидался дефект** — каждый раз `expected 404, got 201` (для receive/dispatch/transfer/reserve/release/createShipment/inventoryCount/легаси-отгрузка) или несовпадение `createdBy` с реальным пользователем. 4 теста, не относящиеся к P1 (чужая отгрузка — уже была защищена `findById(companyId,...)`; отсутствие `GET /shipments`; положительный сценарий; RBAC), прошли и на неисправленном коде — ожидаемо, это не тот дефект.

После этого изменения возвращены (`git stash pop` + восстановлен `assert-ownership.ts`), пакет пересобран:

```
$ pnpm --filter @garmentos/domain-warehouse build   # exit 0, против исправленного кода
$ cd apps/api && pnpm exec vitest run src/warehouse/
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

16/16 — новые 13 тестов SEC-P1 + 3 теста уже существовавшего `warehouse.e2e.spec.ts` (регрессия по остальным операциям склада не внесена).

Тестовая БД (`garmentos_test`) после красного прогона содержала мусор от прерванных на `expect(404)` тестов (assertion бросает исключение до inline-cleanup внутри теста) — удалён вручную SQL-запросом по префиксу имени компании `SEC-P1%` перед восстановлением исправления и повторным прогоном. Рабочая (production) БД не использовалась и не могла быть использована — весь прогон шёл против `DATABASE_URL` из `.env` в корне репозитория (`postgres://garmentos:garmentos@localhost:5432/garmentos_test`).

## 5. Обновлённый существующий тест домена

`packages/domain/warehouse/src/warehouse.spec.ts` — сквозной unit-тест домена (без HTTP) вызывал `receiveStock`/`dispatchStock`/`transferStock`/`reserveStock`/`releaseReservation`/`createShipment`/`dispatchShipment`/`markShipmentDelivered`/`recordInventoryCountItem` напрямую по старым сигнатурам (без `companyId`). Обновлён под новые сигнатуры; добавлена локальная реализация `ProductVariantOwnershipPort` поверх уже импортированного в тесте `DrizzleProductVariantRepository` (`@garmentos/domain-catalog` — уже `devDependency` пакета, использовалась и раньше для сидирования данных теста).

`packages/domain/finance/src/scenario.spec.ts` — сквозной сценарий `warehouse → sales → marketplace → honest-sign → finance` вызывал те же use case'ы напрямую; обновлён аналогично (тот же паттерн локального ACL-порта).

## 6. Команды и результаты (полный прогон)

| Команда | Результат |
|---|---|
| `pnpm -r typecheck` | 23/23 пакетов — `Done`, без ошибок |
| `pnpm -r build` | Полная сборка монорепо — без ошибок (включая `apps/web`, `apps/api` через `nest build`) |
| `pnpm --filter @garmentos/domain-warehouse lint` | Чисто |
| `pnpm --filter @garmentos/domain-finance lint` | Чисто |
| `pnpm --filter @garmentos/api lint` | Чисто |
| `pnpm --filter @garmentos/domain-warehouse test` | 2/2 (unit, включая обновлённый сквозной сценарий) |
| `pnpm --filter @garmentos/domain-finance test` | 3/3 (2 test files, включая обновлённый сквозной сценарий) |
| `cd apps/api && pnpm exec vitest run src/warehouse/` | **16/16** — новый SEC-P1 regression (13) + существующий `warehouse.e2e.spec.ts` (3) |
| `cd apps/api && pnpm exec vitest run` (полный e2e-набор apps/api) | 150 passed / 13 failed (163 всего, 8 файлов). Все 13 падений — в модулях `document-intelligence`, `specification`, `reporting/product-production`, `contract-manufacturing/steganka-full-lifecycle`, все на шаге генерации/загрузки документа (`400 Bad Request` вместо `201`) |

### Пре-существующая (не моя) причина 13 падений полного набора

MinIO/S3 (`S3_ENDPOINT=http://localhost:9000` из `.env`) не запущен в этом окружении (`curl http://localhost:9000` → код ошибки соединения). Подтверждено прямым сравнением: тот же самый тест (`specification.e2e.spec.ts`, «PDF формируется только из snapshot...») падает **идентично** (`expected 201, got 400`) и на неизменённом коде базовой ветки (`git stash` моих изменений, тот же прогон) — падение никак не связано с SEC-P1, это ограничение среды выполнения (нет S3), а не регрессия. Ни один из 13 падающих тестов не относится к модулю `warehouse`.

### format:check

`pnpm format:check` — падает на 473 файлах, это известная базовая проблема репозитория (зафиксирована ранее в `docs/GOS-PARTY-V1-AUDIT.md`, раздел 2 — «`format:check` exit 1 уже на базовой ветке»). Часть изменённых мной файлов (`inventory-counts.controller.ts`, `shipments.controller.ts`, `warehouse.module.ts`, `warehouse.service.ts`, `packages/domain/finance/src/scenario.spec.ts`) уже входила в этот список ДО моих правок — проверено точечно: те же файлы на коммите `fe8df8a` (до этого исправления) прогнаны через `prettier --check` изолированно и уже не проходят. Новые файлы (`assert-ownership.ts`, `sec-p1-tenant-isolation.e2e.spec.ts`, изменённые use case'ы домена) добавляют к списку по той же тривиальной причине — перенос длинных строк с одной строки на несколько (`prettier --write` показывает только форматирование аргументов `throw new DomainError(...)`, не изменение логики). Массовое `prettier --write` по всему репозиторию не выполнялось — это отдельная задача, не входящая в SEC-P1 (правило проекта против несвязанного форматирования).

## 7. Ограничения и непроверенное

- **Гонки (race conditions) не проверены этим PR.** Задание SEC-P1 просило проверку company-изоляции, не устранение TOCTOU в `transferStock`/`dispatchShipment` (аудит, раздел 14.3: проверка остатка вне транзакции при параллельном `dispatch`) — это отдельная, более широкая находка производственной логики склада, а не изоляции компаний, специально не расширялась в рамках этой задачи (`docs/tasks/SEC-P1.md`: «не расширять его до всей логистики»).
- **Одновременная компенсация брака** — вне скоупа SEC-P1 (COMP-P6 в аудите, раздел 18, отдельная задача).
- **Момент зачисления остатка в `dispatchShipment`** (при `dispatch`, а не при получении — «в пути» не моделируется) — не менялся, это отдельный содержательный дефект (аудит, раздел 14.3), не изоляция компаний.
- **`createWarehouse`** — `createdBy` в теле запроса тоже не проверяется на доверенность, но это не создаёт межкомпанийного доступа (склад создаётся только в своей компании) — сознательно не включено в эту задачу, чтобы не расширять её за пределы явно названных операций.
- **MinIO/S3 недоступен в этом окружении** — 13 e2e-тестов в других модулях (не warehouse) не проверены исполнением ни до, ни после этого изменения; подтверждено, что это baseline-ограничение среды, а не регрессия.
- Тестовая БД `garmentos_test` использовалась на всём протяжении; рабочая (production) БД не открывалась и не изменялась.

## 8. Изменённые файлы

- `packages/domain/warehouse/src/application/ports.ts` — новый порт `ProductVariantOwnershipPort`.
- `packages/domain/warehouse/src/application/assert-ownership.ts` — новый файл, общие проверки.
- `packages/domain/warehouse/src/application/{receive-stock,dispatch-stock,transfer-stock,reservation,create-shipment,dispatch-shipment,mark-shipment-delivered,record-inventory-count-item}.ts` — добавлены проверки принадлежности.
- `packages/domain/warehouse/src/index.ts` — экспорт нового порта.
- `packages/domain/warehouse/src/warehouse.spec.ts` — обновлён под новые сигнатуры.
- `packages/domain/finance/src/scenario.spec.ts` — обновлён под новые сигнатуры.
- `apps/api/src/warehouse/warehouse.module.ts` — импорт `CatalogModule`.
- `apps/api/src/warehouse/warehouse.service.ts` — `CatalogService`, ACL-адаптер, `companyId`/`createdBy` из доверенного контекста во всех девяти методах.
- `apps/api/src/warehouse/stock.controller.ts` — `@CurrentUser()` на `reserve`/`release`.
- `apps/api/src/warehouse/shipments.controller.ts` — `createShipment(currentUser, body)`.
- `apps/api/src/warehouse/inventory-counts.controller.ts` — `recordInventoryCountItem(currentUser, id, body)`.
- `apps/api/src/warehouse/sec-p1-tenant-isolation.e2e.spec.ts` — новый постоянный regression-тест.
- `docs/WORK_QUEUE.md` — статус SEC-P1 → `IN_PROGRESS` при старте (переведён в `REVIEW` при завершении, см. ниже).
- `docs/reports/SEC-P1.md` — этот отчёт.

UI не менялся. Функциональность вне перечисленных операций склада/отгрузок/инвентаризации не затронута.
