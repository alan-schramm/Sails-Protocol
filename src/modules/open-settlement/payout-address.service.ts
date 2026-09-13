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

// Missão 11 Fase 9.3.4 — INV-OP-10 (Public Verification Surfaces
// Disclose the Minimum Necessary Fact, Never the Underlying Row —
// docs/PROTOCOL_INVARIANTS.md, Level 2 DP-6). The ONLY shape ever
// returned by GET /v1/settlement/payout-addresses/:participantId/:asset.
// `participantId`/`asset` are the explicit lookup keys the caller
// already supplied, and `address` is the literal committed payout
// destination `escrow.service.ts`'s `resolvePayoutAddress()` falls back
// to. What's deliberately excluded: `id` (internal relational
// identifier, zero verification value), `moduleId`/`protocolVersion`
// (operator bookkeeping), and `createdAt`/`updatedAt` (not required to
// construct or verify a settlement transaction).
//
// F-06 (System Coherence & Integration Audit, 2026-09-13; Privacy
// Decision Review, COHERENCE-CORRECTIVE-1) — corrected: this comment
// previously called the GET route above "unauthenticated" and justified
// it as "a counterparty genuinely needs all three to route a
// settlement." Verified false against real code — no real release path
// ever supplies a caller-provided `toAddress` (every one resolves the
// beneficiary's own registered address server-side, M8-R2), and the one
// real SDK/UI consumer (`Trade.tsx`) is always self-referential. The
// route (`settlement.routes.ts`) now requires authentication and
// self-scoping (caller's own participantId only) — this projection's
// field minimization is unchanged and still governed by INV-OP-10; only
// who may reach it at all has changed.
export interface PublicPayoutAddressView {
  participantId: string
  asset: AssetType
  address: string
}

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

  /**
   * Missão 11 Fase 9.3.4 — the ONLY method the unauthenticated GET route
   * may call. See PublicPayoutAddressView's own comment for exactly
   * which fields are/aren't here. Returns null (not a thrown
   * NotFoundError) for an unregistered participant/asset pair —
   * preserves the route's own existing, hand-written 404 response
   * shape exactly, unchanged by this phase.
   */
  async getPublicView(participantId: string, asset: AssetType): Promise<PublicPayoutAddressView | null> {
    const record = await this.getPayoutAddress(participantId, asset)
    if (!record) return null
    return {
      participantId: record.participantId,
      asset: record.asset as AssetType,
      address: record.address,
    }
  }
}

export const payoutAddressService = new PayoutAddressService()
