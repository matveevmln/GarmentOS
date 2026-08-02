# Собирается из корня монорепозитория: docker build -f infra/docker/api.Dockerfile .
# Переносимо на любую площадку из docs/INFRASTRUCTURE.md — единственная
# зависимость среды исполнения: контейнерный рантайм.
#
# Копирует и собирает ВЕСЬ монорепозиторий внутри образа, а не только
# apps/api: apps/api зависит через pnpm workspace (`workspace:*`) от 15
# пакетов (packages/shared-types, packages/db-schema, packages/domain/*),
# каждый из которых должен быть собран (turbo build, dependsOn: ["^build"])
# до сборки apps/api — main/types в их package.json указывают на dist/,
# не на src/. Копирование только apps/api/package.json (прежний вариант
# этого файла) не давало pnpm install разрешить workspace-зависимости и
# не собирало ни один из них — образ не мог быть собран.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@garmentos/api

FROM node:22-alpine AS runtime
RUN corepack enable
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo .

WORKDIR /repo/apps/api
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
