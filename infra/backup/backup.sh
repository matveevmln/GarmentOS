#!/usr/bin/env bash
# Резервная копия PostgreSQL — docs/ARCHITECTURE_REVIEW.md, находка "первый
# месяц эксплуатации" / Iteration 8 (docs/ROADMAP.md).
#
# Cloud-agnostic по принципу docs/INFRASTRUCTURE.md (docs/PRINCIPLES.md,
# принцип 13): обычный pg_dump через DATABASE_URL, не завязан на конкретную
# управляемую функцию бэкапа облака/PaaS (Railway snapshot и т.п. — держим
# как дополнительный, не единственный слой защиты, см. infra/backup/README.md).
#
# Формат custom (-Fc) — сжатый, поддерживает pg_restore --jobs для
# параллельного восстановления и восстановление отдельных таблиц, в отличие
# от обычного SQL-дампа.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL не задан" >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$(dirname "$0")/../../.backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$BACKUP_DIR/garmentos_${TIMESTAMP}.dump"

pg_dump --dbname="$DATABASE_URL" --format=custom --file="$OUT_FILE"

echo "Бэкап создан: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"

# Ротация — хранить последние N дампов локально (офсайт-хранилище/S3-выгрузка
# настраивается отдельно на конкретной площадке, см. README.md рядом).
KEEP="${BACKUP_KEEP_COUNT:-14}"
ls -1t "$BACKUP_DIR"/garmentos_*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -v
