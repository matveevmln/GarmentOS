# Provisioning — Стадия A (Lean-старт)

Короткие скрипты для разового provisioning одного сервера (docs/INFRASTRUCTURE.md, раздел 3). Не Terraform — на Стадии A это не оправдано (см. `docs/INFRASTRUCTURE.md`, раздел 6).

- `setup-server.sh` — устанавливает Docker и Docker Compose plugin на чистом сервере (Ubuntu/Debian), любая площадка из `docs/INFRASTRUCTURE.md`, раздел 1.

Переход на Terraform (`infra/terraform/`) — когда появится второе окружение или несколько провайдеров одновременно (условия — `docs/INFRASTRUCTURE.md`, раздел 6).
