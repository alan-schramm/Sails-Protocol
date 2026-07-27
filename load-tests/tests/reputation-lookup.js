/**
 * Real reputation reads — reputation.routes.ts's leaderboard and
 * single-participant lookup, both genuinely unauthenticated
 * (open-reputation module). `setup()` registers one real identity once
 * so `:participantId` lookups have a real row to hit; the leaderboard
 * call needs no setup at all. `/v1/reputation/peer/:peerId` is
 * deliberately not exercised here — Participant.peerId isn't populated
 * by the plain register flow this file's `generateTestUser` uses (no
 * separate P2P-peer-registration step is run), so hammering that path
 * would only ever measure 404s, not real lookup throughput.
 */
import { check } from 'k6'
import http from 'k6/http'
import { BASE_URL, baseOptions } from '../k6.config.js'
import { generateTestUser } from '../utils/data-generator.js'
import { reputationLookupDuration, reputationSuccessRate, recordFlow } from '../utils/metrics.js'
import { standard } from '../utils/thresholds.js'

export function setup() {
  const user = generateTestUser(BASE_URL, 'reputation')
  if (!user) throw new Error('setup: could not authenticate the shared test identity')
  return { participantId: user.participantId }
}

/** One real reputation read — alternates leaderboard vs. single-participant lookup so both real routes get exercised under load. */
export function run(participantId) {
  const useLeaderboard = Math.random() < 0.5
  const res = useLeaderboard
    ? http.get(`${BASE_URL}/v1/reputation/leaderboard?limit=20`, { tags: { name: 'reputation_leaderboard' } })
    : http.get(`${BASE_URL}/v1/reputation/${participantId}`, { tags: { name: 'reputation_get' } })

  const ok = check(res, { 'reputation lookup: 200': (r) => r.status === 200 })
  recordFlow({ successRate: reputationSuccessRate, duration: reputationLookupDuration, durationMs: res.timings.duration, ok, response: res })
}

export const options = {
  ...baseOptions,
  scenarios: {
    reputation_lookup: {
      executor: 'constant-arrival-rate',
      rate: 200,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 30,
      maxVUs: 150,
    },
  },
  thresholds: standard,
}

export default function (data) {
  run(data.participantId)
}
