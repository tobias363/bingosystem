/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} walletId
 * @property {string} [displayName]
 * @property {string} [email]
 * @property {string} kycStatus - "VERIFIED" | "UNVERIFIED" | "PENDING" | "REJECTED"
 * @property {string} role - "USER" | "ADMIN"
 * @property {number} balance
 * @property {string} [birthDate]
 * @property {string} [kycVerifiedAt]
 * @property {string} createdAt
 */

/**
 * @typedef {Object} Game
 * @property {string} slug
 * @property {string} title
 * @property {string} description
 * @property {string} route
 * @property {boolean} isEnabled
 * @property {Object} settings
 * @property {string} [settings.launchUrl]
 * @property {number} [settings.prizePool]
 * @property {number} [settings.ticketPrice]
 * @property {number} [settings.levelBadge]
 */

/**
 * @typedef {Object} WalletState
 * @property {Object} account
 * @property {string} account.id
 * @property {number} account.balance
 * @property {string} account.updatedAt
 * @property {Array<Object>} transactions
 */

// Export an empty object to make this a valid ES Module
export {};
