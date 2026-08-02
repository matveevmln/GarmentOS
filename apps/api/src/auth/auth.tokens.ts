// Токены DI для доменных портов, специфичных для Auth (не разделяемых с
// остальными сценариями Identity & Access — те регистрируются в
// identity.module.ts и импортируются сюда).
export const REFRESH_TOKEN_REPOSITORY = Symbol("REFRESH_TOKEN_REPOSITORY");
export const PASSWORD_VERIFIER = Symbol("PASSWORD_VERIFIER");
