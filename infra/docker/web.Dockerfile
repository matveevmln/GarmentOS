# Собирается из корня монорепозитория: docker build -f infra/docker/web.Dockerfile .
# Тот же принцип, что и api.Dockerfile — apps/web зависит через workspace от
# @garmentos/shared-types, поэтому собирается весь монорепозиторий, не
# только apps/web.
#
# VITE_API_URL — Vite встраивает переменные окружения в собранный бандл во
# время `vite build` (не читает их заново в браузере в рантайме), поэтому
# это обязательный build-time ARG, а не обычная переменная окружения
# контейнера — без неё собранный фронтенд будет обращаться к
# localhost:3000 независимо от того, где реально развёрнут apps/api.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm turbo run build --filter=@garmentos/web

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /repo/apps/web/dist ./dist
COPY --from=build /repo/apps/web/serve.cjs ./serve.cjs

USER node
EXPOSE 4173
CMD ["node", "serve.cjs"]
