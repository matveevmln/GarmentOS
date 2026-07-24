#!/usr/bin/env bash
# Разовый provisioning одного сервера для Стадии A (docs/INFRASTRUCTURE.md, раздел 3).
# Устанавливает Docker + Compose plugin. Переносимо на любую площадку из
# docs/INFRASTRUCTURE.md, раздел 1 (Ubuntu/Debian).
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin недоступен — проверьте установку Docker (>= 20.10)." >&2
  exit 1
fi

echo "Docker и Docker Compose готовы. Далее: скопируйте .env.example -> .env, заполните значения и запустите:"
echo "  docker compose -f infra/docker-compose.yml up -d"
