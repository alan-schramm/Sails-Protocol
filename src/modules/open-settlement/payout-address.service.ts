/**
 * PayoutAddressService — Sails OpenSettlement
 *
 * Closes a real, recurring gap (`BACKLOG.md`'s "Participant payout
 * address" row): `escrow.service.ts`'s `releaseFunds()`/`splitFunds()`
 * and `dispute.service.ts`'s `resolveDispute()` all needed a real crypto
 * address to pay a participant out to, and no schema field modeled one
 * for any asset — callers had to pass it explicitly every time, with no
 * way to register it once and reuse it. This service is that
 * registration surface; `escrow.service.ts`'s `resolvePayoutAddress()`
 * private helper is the actual fallback consumer.
 *
 * Deliberately separate from `PaymentAccount` (RFC-021 D5): that models
 * the FIAT rail a trader *receives PIX/bank transfers on* (with a trust
 * ramp, chargeback tracking); this models the crypto address a trader
 * *receives released escrow funds at* — different asset class, different
 * risk model, no trust ramp needed (a wrong address just fails to
 * receive funds, it doesn't enable a chargeback).
 *
 * One row per (participant, asset) — `PayoutAddress.@@unique` enforces
 * this — never a single address covering every asset, since a BTC
 * address and an EVM address are unrelated values.
 */
import { prisma } from '../../common/database'
import { NotFoundError } from '../../common/errors'
import type { AssetType } from '../../common/types'

export class PayoutAddressService {
  /**
   * Idempotent: a participant re-registering the same asset overwrites
   * their previous address for it (upsert) — same "resubmitting your own
   * row is fine" shape `escrow.service.ts`'s `submitParticipantKey()`
   * already uses for client-held keys.
   */
  async setPayoutAddress(participantId: string, asset: AssetType, address: string) {
    return prisma.payoutAddress.upsert({
      where: { participantId_asset: { participantId, asset } },
      update: { address },
      create: { participantId, asset, address },
    })
  }

  async getPayoutAddress(participantId: string, asset: AssetType) {
    return prisma.payoutAddress.findUnique({ where: { participantId_asset: { participantId, asset } } })
  }

  async getPayoutAddressOrThrow(participantId: string, asset: AssetType) {
    const record = await this.getPayoutAddress(participantId, asset)
    if (!record) throw new NotFoundError('PayoutAddress', `${participantId}:${asset}`)
    return record
  }
}

export const payoutAddressService = new PayoutAddressService()
