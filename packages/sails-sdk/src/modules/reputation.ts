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
import type { ReputationScore } from '../types'

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

  async leaderboard(limit?: number): Promise<ReputationScore[]> {
    return this.transport.get<ReputationScore[]>('/v1/reputation/leaderboard', { limit })
  }

  /** Requires an active session. Informational only — see this file's header. */
  async rate(input: RateInput): Promise<unknown> {
    return this.transport.post('/v1/reputation/rate', input, true)
  }
}
