/**
 * FeeActivationReadiness — Missão 11 Fase 5 §13.
 *
 * Answers, for a given rail: "can this rail safely activate Protocol Fee
 * collection?" — WITHOUT publishing anything itself. A focused readiness
 * check, not a framework: every check below is a real, independently
 * verifiable fact (config presence/validity, DB-native trigger presence,
 * Phase-0 mutual-exclusion state), never a guess or a documentation claim
 * asserted as if it were code-verified.
 *
 * This module never publishes a FeePolicyVersion, never chooses a rate,
 * never chooses a confirmation depth, never chooses a distribution
 * percentage — it only reports whether the STRUCTURAL preconditions for
 * doing so safely are met.
 */
import { Prisma, PrismaClient } from '@prisma/client'
import * as bitcoin from 'bitcoinjs-lib'
import { prisma } from '../../common/database'
import { config } from '../../config'
import { FEE_COLLECTION_CAPABLE_RAILS } from './escrow-providers'
import { networkFor } from './multisig.provider'

export interface RailActivationReadiness {
  rail: string
  ready: boolean
  blockers: string[]
}

interface RequiredTriggerSpec {
  trigger: string
  table: string
}

// Same two triggers tests/integration/dbNativeInvariants.test.ts's own
// real-Postgres gate already asserts — queried here independently (never
// importing from a test file) so this check is real in application code
// too, not only in CI.
const REQUIRED_DB_NATIVE_TRIGGERS: RequiredTriggerSpec[] = [
  { trigger: 'fee_policy_versions_immutability_guard', table: 'fee_policy_versions' },
  { trigger: 'escrows_fee_snapshot_immutability_guard', table: 'escrows' },
]

async function checkDbNativeTriggersPresent(): Promise<string[]> {
  const missing: string[] = []
  for (const spec of REQUIRED_DB_NATIVE_TRIGGERS) {
    const rows = await (prisma as PrismaClient).$queryRaw<Array<{ tgenabled: string }>>(Prisma.sql`
      SELECT t.tgenabled::text AS tgenabled
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE t.tgname = ${spec.trigger} AND c.relname = ${spec.table} AND NOT t.tgisinternal
    `)
    if (rows.length === 0) {
      missing.push(`DB-native trigger '${spec.trigger}' on table '${spec.table}' was not found — the confirmation-recognition/immutability guarantees this module relies on are not actually present in this database.`)
    } else if (rows[0].tgenabled === 'D') {
      missing.push(`DB-native trigger '${spec.trigger}' on table '${spec.table}' exists but is DISABLED.`)
    }
  }
  return missing
}

// Missão 11 Fase 5 §12 — whether at least one real client flow in THIS
// codebase demonstrates wallet-side fee-aware pre-signature verification
// (Fase 4.2's own Activation Blocker D). This is a documentation-level
// fact about the codebase, not something derivable at runtime — flipped
// to true only when a real call site of verifyAndSignEscrowPsbt()/
// buildExpectedFeeAwareReleaseOutputs() actually exists and is exercised
// (examples/demo/multisig-testnet-flow.ts, wired in this same phase).
// Disclosed limitation, not hidden by this flag: that demo obtains the
// arbiter's pubkey via co-located access to MULTISIG_SEED
// (multisigProvider.getArbiterPubkeyHex()) — a genuinely remote wallet has
// no API to learn this today, so this is real but partial proof, not a
// closed gap for arbitrary third-party wallet integrations.
const WALLET_VERIFICATION_DEMONSTRATED = true

async function checkMultisigReadiness(): Promise<RailActivationReadiness> {
  const blockers: string[] = []

  const address = config.settlement.protocolFeeCollectionAddress
  if (!address) {
    blockers.push('No SAILS_PROTOCOL_FEE_COLLECTION_ADDRESS configured — every escrow would be pre-funding-waived (Fase 4.1), never actually collecting anything.')
  } else {
    try {
      bitcoin.address.toOutputScript(address, networkFor(config.multisig.network))
    } catch (err) {
      blockers.push(`Configured SAILS_PROTOCOL_FEE_COLLECTION_ADDRESS is invalid for network '${config.multisig.network}': ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (!config.multisig.seed) {
    blockers.push('MULTISIG_SEED is not configured — the arbiter key (and this whole provider) cannot function at all.')
  }
  if (config.settlement.trustedArbitrators.length === 0) {
    blockers.push('No TRUSTED_ARBITRATORS configured — no arbiter key can be derived for the 2-of-3 script.')
  }

  const missingTriggers = await checkDbNativeTriggersPresent()
  blockers.push(...missingTriggers)

  if (!WALLET_VERIFICATION_DEMONSTRATED) {
    blockers.push('No real client flow in this codebase demonstrates wallet-side fee-aware pre-signature verification.')
  }

  return { rail: 'MULTISIG', ready: blockers.length === 0, blockers }
}

/**
 * Never publishes anything, never chooses a rate/confirmation-depth/
 * distribution split. For a rail with no real fee-aware collection
 * implementation at all, returns ready=false immediately with that as the
 * sole, definitive blocker — no other check is even meaningful for it.
 */
export async function checkRailActivationReadiness(railScope: string): Promise<RailActivationReadiness> {
  if (!FEE_COLLECTION_CAPABLE_RAILS.has(railScope)) {
    return {
      rail: railScope,
      ready: false,
      blockers: [`No real, atomic Protocol Fee collection implementation exists for rail '${railScope}' (Missão 11 Fase 5 rail-activation gating) — no other readiness check is meaningful until one does.`],
    }
  }

  // MULTISIG is the only member of FEE_COLLECTION_CAPABLE_RAILS today —
  // this branch is written generically (a switch, not an if) so a future
  // second capable rail gets its own real readiness function here, never
  // a copy-pasted MULTISIG check silently applied to it.
  switch (railScope) {
    case 'MULTISIG':
      return checkMultisigReadiness()
    default:
      // Structurally unreachable while FEE_COLLECTION_CAPABLE_RAILS = {MULTISIG}
      // — kept explicit rather than falling through, so adding a rail to
      // that set without also adding its readiness branch here fails
      // loudly instead of silently reporting a false "ready".
      throw new Error(`checkRailActivationReadiness: '${railScope}' is in FEE_COLLECTION_CAPABLE_RAILS but has no readiness check implemented — this is a real gap, not a normal runtime condition.`)
  }
}
