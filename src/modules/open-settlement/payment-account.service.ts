/**
 * PaymentAccountService — Sails OpenSettlement
 * RFC-021 D5 (`docs/rfcs/RFC-021-market-based-arbitration-and-payment-trust.md`).
 *
 * Real payment-account trust ramp, modeled on Bisq's actual "Payment
 * account age witness"/account signing (verified against Bisq's own
 * docs before writing this, not invented). A SEPARATE risk dimension
 * from `reputation.service.ts`'s `User.reputationScore`: this measures
 * whether a specific payment rail (a PIX key, a bank account) has
 * survived a completed trade without a chargeback — an otherwise
 * reputable trader's account can still be stolen/compromised, which is
 * exactly the "conta laranja" (mule account) risk trader reputation
 * alone does not cover.
 *
 * `signPaymentAccount()` deliberately reuses D1's narrow-attestation
 * framing (the same reasoning `market-arbitration.provider.ts`'s header
 * comment states for arbiters): the signer is attesting "this specific
 * trade completed without dispute," never "this person is trustworthy."
 */
import { createHash } from 'node:crypto'
import { prisma } from '../../common/database'
import { NotFoundError } from '../../common/errors'
import type { PaymentMethod } from '../../common/types'

// RFC-021 D5 — trade-limit ramp. Deliberately reuses SECURITY_MODEL.md
// §1.4's exact tier values (0.001/0.01/0.05 BTC, unlimited) rather than
// inventing a second, conflicting number scale — a trader should see
// one coherent limit, not two systems disagreeing. Starting proposal,
// not final (PROTOCOL_ECONOMY.md §7's own "not fixed forever" precedent
// applies here too).
export const UNSIGNED_TRADE_LIMIT = '0.001'
export const SIGNED_TRADE_LIMIT = '0.01'
export const ESTABLISHED_TRADE_LIMIT = '0.05'
export const ESTABLISHED_TRADE_COUNT = 5
export const TRUSTED_TRADE_COUNT = 20 // + zero chargebacks -> unlimited

export class PaymentAccountService {
  /**
   * Privacy-preserving hash — the raw account identifier (PIX key, bank
   * account number) is never stored, matching Bisq's own
   * AccountAgeWitness shape: a hash both sides can check without either
   * seeing the other's real account data.
   */
  hashAccountIdentifier(paymentMethod: string, rawIdentifier: string): string {
    return createHash('sha256').update(`${paymentMethod}:${rawIdentifier}`).digest('hex')
  }

  /** Idempotent: returns the existing PaymentAccount if this hash was already seen, otherwise creates it. */
  async getOrCreate(ownerId: string, accountHash: string, paymentMethod: PaymentMethod) {
    const existing = await prisma.paymentAccount.findUnique({ where: { accountHash } })
    if (existing) return existing
    return prisma.paymentAccount.create({ data: { ownerId, accountHash, paymentMethod } })
  }

  async getByHash(accountHash: string) {
    const account = await prisma.paymentAccount.findUnique({ where: { accountHash } })
    if (!account) throw new NotFoundError('PaymentAccount', accountHash)
    return account
  }

  /**
   * D5's real attestation — narrow, factual, matches D1's arbiter
   * framing exactly: "I saw this specific trade complete without a
   * chargeback," not a KYC/compliance vouch. Only meaningful on an
   * account's first clean trade (`signed` is a one-way flag); calling
   * this again on an already-signed account is a no-op, not an error —
   * a second attestation adds nothing signing didn't already establish.
   */
  async signPaymentAccount(accountHash: string, signedBy: string) {
    const account = await this.getByHash(accountHash)
    if (account.signed) return account
    return prisma.paymentAccount.update({
      where: { accountHash },
      data: { signed: true, signedBy, signedAt: new Date() },
    })
  }

  /** Called on a real completed (non-disputed, non-chargeback) trade using this account. */
  async recordCompletedTrade(accountHash: string) {
    return prisma.paymentAccount.update({
      where: { accountHash },
      data: { completedTrades: { increment: 1 } },
    })
  }

  /** Called when a chargeback/reversal is reported against this account. */
  async recordChargeback(accountHash: string) {
    return prisma.paymentAccount.update({
      where: { accountHash },
      data: { chargebacks: { increment: 1 } },
    })
  }

  /**
   * The real ramp. A brand-new/never-signed account gets
   * UNSIGNED_TRADE_LIMIT regardless of anything else — signing only
   * happens after a completed trade, so this is the genuine floor for
   * an account nobody has ever transacted with. Any real chargeback
   * caps the account at SIGNED_TRADE_LIMIT permanently — a single
   * reversal is treated as a real, disqualifying signal for the
   * "unlimited" tier, not averaged away by later good trades.
   */
  async getTradeLimit(accountHash: string): Promise<string> {
    const account = await this.getByHash(accountHash)
    if (!account.signed) return UNSIGNED_TRADE_LIMIT
    if (account.chargebacks > 0) return SIGNED_TRADE_LIMIT
    if (account.completedTrades >= TRUSTED_TRADE_COUNT) return 'unlimited'
    if (account.completedTrades >= ESTABLISHED_TRADE_COUNT) return ESTABLISHED_TRADE_LIMIT
    return SIGNED_TRADE_LIMIT
  }
}

export const paymentAccountService = new PaymentAccountService()
