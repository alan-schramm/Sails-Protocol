/**
 * Shared pagination defaults — TECHNICAL_DEBT_AUDIT.md item 18.
 *
 * Only for the three call sites that already used the identical 10/50
 * convention on purpose (trade.service.ts's getTrades(), dispute.service.ts's
 * listForArbiter(), liquidity.service.ts's InternalOrderBook.getOffers() —
 * the last of which is the one this convention was originally copied from,
 * per that file's own comment: "matched here rather than inventing a second
 * pagination convention"). Chat (50/100) and Reputation (20/—) use
 * deliberately different limits for their own endpoints and are NOT
 * unified here — forcing them onto these same two numbers would be a real
 * behavior change to their public API defaults, not a cleanup.
 */
export const DEFAULT_PAGE_LIMIT = 10
export const MAX_PAGE_LIMIT = 50
