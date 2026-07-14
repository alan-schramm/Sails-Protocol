/**
 * Capability / CapabilityGrant — PROTOCOL_SPECIFICATION.md §1.10,
 * rfcs/RFC-005-capability-model.md. Frozen shape (Protocol Freeze, v8.8).
 * Do not change without RFC-006+.
 *
 * This file was missing — referenced by src/core/capability-registry.ts
 * but never created. Found during a verification pass before dev handoff.
 */

// The abstract functional category a module implements —
// "OpenP2P implements the trade-coordination Capability."
export interface Capability {
  capabilityName: string
  version: string
  events: string[]
  states: string[]
  requiredGrants: string[]
  api: string[]
}

export interface CapabilityImplementation {
  capabilityName: string
  moduleId: string
}

// The permission grant — "this Agent may invoke trade-coordination,
// scoped to X, granted by Y."
export interface CapabilityGrant {
  grantId: string
  grantedTo: string              // a Participant or Agent (RFC-001)
  capabilityName: string
  scope: string[]
  constraints?: Record<string, unknown>
  issuedBy: string
}
