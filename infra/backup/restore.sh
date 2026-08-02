#!/usr/bin/env bash
# Восстановление из дампа, созданного backup.sh.
#
# Намеренно требует TARGET_DATABASE_URL отдельной переменной (не
# DATABASE_URL) — восстановление в переменную, которую разработчик мог
# unintentionally оставить указывающей на боевую БД, было бы ровно тем
# риском, который описан в docs/ARCHITECTURE_REVIEW.md, находка 2.3.
set -euo pipefail

DUMP_FILE="${1:?Использование: restore.sh <путь-к-дампу.dump>}"

if [ -z "${TARGET_DATABASE_URL:-}" ]; then
  echo "TARGET_DATABASE_URL не задан — явно укажите, куда восстанавливать (не DATABASE_URL)" >&2
  exit 1
fi

if [ ! -f "$DUMP_FILE" ]; then
  echo "Файл дампа не найден: $DUMP_FILE" >&2
  exit 1
fi

echo "Восстанавливаю $DUMP_FILE в $TARGET_DATABASE_URL ..."
pg_restore --dbname="$TARGET_DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$DUMP_FILE"
echo "Восстановление завершено."
