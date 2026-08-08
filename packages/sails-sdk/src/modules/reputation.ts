/**
 * @sails/sdk — Sails OpenReputation module (API_REFERENCE.md section 6,
 * verified against src/modules/open-reputation/reputation.routes.ts directly).
 *
 * RFC-007 note (also in the route doc, repeated here since it changes
 * what a caller should expect from rate()): `rate()` is informational
 * feedback only — it does not feed the score `get()` returns. Do not
 * build UI that implies otherwise.
 */
import type { SailsTransport } from '../transport'
import type { ReputationScore, LeaderboardResult, Vouch } from '../types'

export interface RateInput {
  tradeId: string
  ratedId: string
  score: 1 | 2 | 3 | 4 | 5
  comment?: string
}

export class SailsReputationModule {
  constructor(private readonly transport: SailsTransport) {}

  async get(participantId: string): Promise<ReputationScore> {
    return this.transport.get<ReputationScore>(`/v1/reputation/${participantId}`)
  }

  /**
   * RFC-021 — look up a participant's score by their Pears
   * peerId (the portable identity substrate), not their
   * participantId. The backend has separate routes for each
   * lookup path; this method covers the peerId path.
   */
  async getScoreByPeerId(peerId: string): Promise<ReputationScore> {
    return this.transport.get<ReputationScore>(`/v1/reputation/peer/${peerId}`)
  }

  /** Paginated (reputation.service.ts's getLeaderboard()) — each row is a
   *  LeaderboardEntry, not the full ReputationScore shape (see that
   *  type's own comment for why). */
  async leaderboard(pagination?: { limit?: number; offset?: number }): Promise<LeaderboardResult> {
    return this.transport.get<LeaderboardResult>('/v1/reputation/leaderboard', {
      limit: pagination?.limit,
      offset: pagination?.offset,
    })
  }

  /** Requires an active session. Informational only — see this file's header. */
  async rate(input: RateInput): Promise<unknown> {
    return this.transport.post('/v1/reputation/rate', input, true)
  }

  /**
   * RFC-021 D7 — requires an active session. Vouches for `voucheeId` with
   * the caller's own reputation on the line, NOT a KYC/identity check —
   * this protocol does not do KYC. The server rejects the call if the
   * caller doesn't meet the real eligibility bar (trade history + positive
   * reputation) — see `vouch.service.ts`'s own header for the full
   * mechanics, including the real reputation penalty the caller takes if
   * the vouchee's first dispute is lost while this vouch is still active.
   */
  async vouchFor(voucheeId: string): Promise<Vouch> {
    return this.transport.post<Vouch>('/v1/reputation/vouch', { voucheeId }, true)
  }
}
