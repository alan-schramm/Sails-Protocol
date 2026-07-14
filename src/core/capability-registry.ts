/**
 * Capability Registry — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 1.10
 *
 * STUB — not yet implemented. This is where AgentScope (section 1.7) and
 * verificationLevel (section 1.1) become concrete instances of one unified
 * Capability grant, instead of two separate mechanisms.
 */
import type { Capability } from '../common/types/capability'

export interface CapabilityRegistry {
  grant(capability: Capability): Promise<void>
  check(grantedTo: string, requiredScope: string): Promise<boolean>
  revoke(capabilityId: string): Promise<void>
}

// TODO(Meses 1-3): implement against Prisma, backed by a `capabilities` table.
export const capabilityRegistry: CapabilityRegistry = {
  async grant() { throw new Error('Not yet implemented — see TODO.md') },
  async check() { throw new Error('Not yet implemented — see TODO.md') },
  async revoke() { throw new Error('Not yet implemented — see TODO.md') },
}
