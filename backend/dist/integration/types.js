/**
 * Integration types for third-party provider embedding.
 *
 * These types define the contract between CandyWeb backend and an external
 * provider who embeds the game in an iframe and owns the player wallet.
 */
// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------
/** Standardised error codes for the integration API. */
export const IntegrationErrorCode = {
    INVALID_SESSION_TOKEN: "INVALID_SESSION_TOKEN",
    SESSION_EXPIRED: "SESSION_EXPIRED",
    INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
    DUPLICATE_TRANSACTION: "DUPLICATE_TRANSACTION",
    PLAYER_NOT_FOUND: "PLAYER_NOT_FOUND",
    WALLET_UNAVAILABLE: "WALLET_UNAVAILABLE",
    WALLET_TIMEOUT: "WALLET_TIMEOUT",
    INVALID_AMOUNT: "INVALID_AMOUNT",
    INVALID_CURRENCY: "INVALID_CURRENCY",
    PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
    LAUNCH_TOKEN_INVALID: "LAUNCH_TOKEN_INVALID",
    LAUNCH_TOKEN_EXPIRED: "LAUNCH_TOKEN_EXPIRED",
    WEBHOOK_DELIVERY_FAILED: "WEBHOOK_DELIVERY_FAILED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
};
