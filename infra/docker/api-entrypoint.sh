#!/bin/sh
set -e

# Railway монтирует volume от имени root независимо от пользователя образа
# (docs.railway.com/volumes#permissions) — а сами volume вообще не
# подключены на этапе preDeployCommand, только когда контейнер стартует
# по-настоящему (docs.railway.com/volumes#volume-availability). Поэтому
# точку монтирования нельзя починить ни в Dockerfile RUN (volume ещё нет
# при сборке), ни в preDeployCommand (volume ещё нет и там) — только здесь,
# в самом entrypoint процесса, который реально запускается со смонтированным
# volume.
#
# Контейнер стартует от root ровно на этот один шаг (chown точки монтирования
# документов), затем немедленно передаёт управление процессу приложения от
# имени непривилегированного пользователя node через su-exec — сам сервер
# (exec ниже) в течение всего времени работы выполняется НЕ от root.
#
# Официальная альтернатива Railway — переменная RAILWAY_RUN_UID=0 — заставила
# бы весь процесс приложения работать от root постоянно, что запрещено
# явным требованием владельца проекта; поэтому здесь используется
# классический паттерн drop-privileges (тот же, что в официальных образах
# postgres/mysql), а не платформенная переменная.
TARGET_DIR="${LOCAL_STORAGE_DIR:-./.local-storage}"
mkdir -p "$TARGET_DIR"
chown -R node:node "$TARGET_DIR"

exec su-exec node "$@"
