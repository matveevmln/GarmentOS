# Первый публичный запуск GarmentOS на Railway

Пошаговый ручной сценарий для владельца проекта — у агента нет учётных
данных ни одного облачного провайдера и нет доступа к railway.app из
песочницы (проверено: исходящее соединение блокируется прокси), поэтому
этот шаг обязательно делается руками, по этой инструкции. Если что-то на
каком-то шаге не совпадёт с описанным (Railway меняет интерфейс) —
пришлите точный текст ошибки, поправим сразу.

Выбор Railway, а не сразу VPS — решение владельца проекта (не пересматривает
`docs/INFRASTRUCTURE.md`, Стадия A остаётся self-hosted VPS по умолчанию для
после-пилотного этапа; Railway — временная площадка для периода тестирования
двумя пользователями).

## Что нужно на Railway сейчас (пилот, 2 пользователя)

Только 3 сервиса в одном Railway-проекте:
1. **PostgreSQL** — управляемый плагин Railway, без Dockerfile.
2. **api** — собирается из `infra/docker/api.Dockerfile`.
3. **web** — собирается из `infra/docker/web.Dockerfile`.

Redis и S3/MinIO **не нужны на этом этапе** — в коде уже есть безопасный
fallback: без `S3_ENDPOINT` документы пишутся на локальный диск сервиса
(`apps/api/src/document/document.module.ts`), а Redis пока нигде не
используется рантаймом (`REDIS_URL` объявлена в `.env.example` под будущий
BullMQ, но ни один модуль её ещё не читает). Добавим оба сервиса отдельным
шагом, когда реально понадобятся (документы/очереди), не раньше.

## Шаги в интерфейсе Railway

1. **New Project → Deploy from GitHub repo** → выбрать `matveevmln/GarmentOS`,
   ветку `claude/garmentos-foundation-architecture-ahvh6b`.
2. Railway попытается автоматически определить один сервис — удалить его
   и добавить три вручную (**+ New**), т.к. в репозитории два независимых
   Dockerfile и управляемая база:
   - **+ New → Database → PostgreSQL** — ничего не настраивать, Railway сам
     создаёт `DATABASE_URL`.
   - **+ New → GitHub Repo** (тот же репозиторий) → назвать `api`. В
     **Settings → Build**: Builder = `Dockerfile`, Dockerfile Path =
     `infra/docker/api.Dockerfile`, Root Directory = `/` (корень
     репозитория — обязательно, иначе сборка не увидит остальные пакеты
     монорепозитория).
   - **+ New → GitHub Repo** (тот же репозиторий) → назвать `web`. Те же
     настройки, но Dockerfile Path = `infra/docker/web.Dockerfile`.
3. **Переменные окружения сервиса `api`** (Settings → Variables):
   ```
   NODE_ENV=production
   DATABASE_URL=${{Postgres.DATABASE_URL}}   # ссылка на плагин, не текст руками
   JWT_ACCESS_SECRET=<сгенерировать: openssl rand -hex 32>
   JWT_REFRESH_SECRET=<сгенерировать другой: openssl rand -hex 32>
   CORS_ORIGIN=https://<публичный домен сервиса web>.up.railway.app
   ```
   Публичный домен `api` появится после первого деплоя (Settings →
   Networking → Generate Domain) — на него ссылается `web` в шаге 4.
4. **Переменные сервиса `web`** — обязательно как **build-time** переменная
   (Railway автоматически передаёт переменные сервиса как Docker build
   args для Dockerfile-сборки):
   ```
   VITE_API_URL=https://<публичный домен сервиса api>.up.railway.app/v1
   ```
   Домен `web` тоже включить через Settings → Networking → Generate Domain
   — это и есть итоговая ссылка, по которой вы будете заходить.
5. После первого успешного деплоя `api` — применить миграции один раз
   (Railway → сервис `api` → **Shell**, либо `railway run` из Railway CLI
   у себя на компьютере):
   ```
   cd /repo && pnpm --filter @garmentos/db-schema db:migrate
   ```
6. Завести компанию и владельца Богдана (CLI-бутстрап, не через UI —
   осознанное решение `docs/AUTH_ARCHITECTURE.md` §9):
   ```
   cd /repo/apps/api && node dist/bootstrap-company.script.js \
     --name "<название компании>" \
     --owner-email "bogdan@<домен>" \
     --owner-full-name "Богдан <фамилия>" \
     --owner-password "<пароль>"
   ```
   Скрипт выводит `company.id` в лог — понадобится на следующем шаге.
7. Завести Артёма как второго пользователя той же компании (найденный по
   ходу подготовки пробел: `POST /users` создаёт пользователя, но не
   назначает роль — без роли он не смог бы ничего делать после входа;
   `add-user.script.ts` делает оба шага одним вызовом, как и
   bootstrap-company):
   ```
   cd /repo/apps/api && node dist/add-user.script.js \
     --company-id "<company.id из шага 6>" \
     --email "artem@<домен>" \
     --full-name "Артём <фамилия>" \
     --password "<пароль>" \
     --role owner
   ```
   `--role owner` — по умолчанию, если оба должны иметь одинаковый полный
   доступ (роль `director` в seed-миграции чуть уже — без `identity.read`/
   `identity.write`, если захотите различать права).

## Известный компромисс, который стоит знать заранее

`api.Dockerfile`/`web.Dockerfile` в этой первой версии копируют в финальный
образ **весь** репозиторий (включая dev-зависимости), а не только
production-минимум — сделано так намеренно, чтобы не полагаться на
неполностью проверенное поведение `pnpm deploy` без возможности реально
собрать образ в этой песочнице (нет доступа к Docker daemon). Образ будет
заметно тяжелее, чем нужно — это не проблема для пилота на 2 пользователей,
но стоит облегчить перед переездом на VPS/ростом нагрузки (внести в
`docs/MASTER_BACKLOG.md` как технический долг Этапа 2-3, не делать сейчас).
