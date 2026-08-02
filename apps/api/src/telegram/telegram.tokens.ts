// Токен DI для исходящего Telegram-клиента (транспортный слой, не отдельный
// доменный bounded context — docs/TELEGRAM_INTEGRATION_ARCHITECTURE.md,
// раздел 0, тот же принцип, что и Inbox). WORKSHOP_REPOSITORY переиспользуется
// из ../contract-manufacturing/contract-manufacturing.tokens — не дублируется.
export const TELEGRAM_CLIENT = Symbol("TELEGRAM_CLIENT");
