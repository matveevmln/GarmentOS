# GarmentOS — визуальный прототип

Кликабельный Mobile-First прототип интерфейса GarmentOS (`docs/ROADMAP.md`,
Итерация 11) — статичная страница на реальных данных проекта, полностью
независимая от `apps/api`: никаких сетевых запросов, никакого backend,
навигация и состояние экрана — на клиентском JS внутри `index.html`.

Назначение — визуальный UX/UI-обзор перед началом полноценной разработки
`apps/web`, не рабочий продукт.

## Запуск локально

```
pnpm install
pnpm --filter @garmentos/prototype dev
```

## Сборка

```
pnpm --filter @garmentos/prototype build
```

Собирается в `apps/prototype/dist` — статичные файлы, никакой серверной части.

## Деплой на Vercel

1. New Project → Import Git Repository → этот репозиторий.
2. **Root Directory**: `apps/prototype`.
3. Framework Preset — Vite определяется автоматически (Build Command
   `pnpm build`, Output Directory `dist`).
4. Deploy — каждый новый коммит в эту папку получает свой Preview Deployment
   автоматически, без передачи токенов кому-либо.
