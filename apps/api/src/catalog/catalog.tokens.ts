// Токены DI для доменных портов Catalog (packages/domain/catalog —
// application/ports.ts). Тот же паттерн, что и в identity.tokens.ts.
export const COLLECTION_REPOSITORY = Symbol("COLLECTION_REPOSITORY");
export const PRODUCT_REPOSITORY = Symbol("PRODUCT_REPOSITORY");
export const PRODUCT_VARIANT_REPOSITORY = Symbol("PRODUCT_VARIANT_REPOSITORY");
