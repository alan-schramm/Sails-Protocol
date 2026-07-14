/**
 * Intent Engine — Sails Protocol Core Component
 * PROTOCOL_SPECIFICATION.md section 2 (full spec)
 *
 * STUB — not yet implemented. Routes Intents by type via registered
 * IntentHandlers (section 2.7 — the plugin pattern). Never imports a
 * module directly; modules register themselves at boot.
 */
import type { Intent, IntentType, IntentHandler, IntentPayload } from '../common/types/intent'

export interface IntentEngine {
  registerHandler<T extends IntentPayload>(handler: IntentHandler<T>): void
  create<T extends IntentPayload>(type: IntentType, payload: T, participantId: string): Promise<Intent<T>>
  cancel(intentId: string): Promise<void>
}

// TODO(Meses 1-3): implement against the intents/intent_payloads/
// intent_transitions tables described in PROTOCOL_SPECIFICATION.md section 2.6
// (none of which exist in schema.prisma yet — see TODO.md section 7).
export const intentEngine: IntentEngine = {
  registerHandler() { throw new Error('Not yet implemented — see TODO.md') },
  async create() { throw new Error('Not yet implemented — see TODO.md') },
  async cancel() { throw new Error('Not yet implemented — see TODO.md') },
}
