/**
 * Sails — Persistent Node Identity (ADR-001 §7/§21 step (b))
 *
 * **Central property:** a Sails Node participating in network discovery
 * must have a stable operational identity across ordinary restarts.
 *
 * **Confirmed current gap, before this module existed** (`pear.service.ts`'s
 * `PearNode.start()`): every call to `HyperDHT.keyPair()` with no
 * argument generates a fresh, random Ed25519 keypair — regenerated on
 * every server restart (this repository's `PearNode`/`PearNodeRegistry`
 * hold all node state in process memory only). Reproduced directly,
 * empirically, not merely inferred from reading the source: calling
 * `HyperDHT.keyPair()` twice, back to back, in the real, installed
 * `hyperdht@6.33.2` package produces two different `publicKey` values
 * every time (`tests/nodeIdentity.test.ts`'s own "CONFIRMED gap" test —
 * this exact fact is also demonstrated indirectly by every other test in
 * that file, since none of them would need this module to exist
 * otherwise).
 *
 * **Mechanism (OFFICIAL IMPLEMENTATION evidence — read directly from
 * `node_modules/hyperdht/index.js` and `node_modules/hyperdht/lib/crypto.js`,
 * and confirmed by running the real library, not assumed):**
 * `HyperDHT.keyPair(seed)` calls libsodium's
 * `crypto_sign_seed_keypair(publicKey, secretKey, seed)` when a `seed` is
 * supplied — the STANDARD, official Ed25519 deterministic-keypair
 * derivation (the same primitive `tweetnacl`'s own `sign.keyPair.fromSeed()`
 * wraps). Confirmed empirically: the identical 32-byte seed always
 * produces the identical `{publicKey, secretKey}` pair; a seed of any
 * other length throws `"seed must be 'crypto_sign_SEEDBYTES' bytes"` —
 * `crypto_sign_SEEDBYTES` is exactly 32. No new cryptographic primitive
 * is introduced here — this module's entire job is generating,
 * persisting, and reloading that one 32-byte seed; the actual Ed25519
 * derivation is `hyperdht`'s own, official, already-in-use code path.
 *
 * **Node Identity ≠ Participant Identity, preserved structurally, not by
 * convention alone:** this module never reads, writes, or derives from
 * `User.publicKey`/`User.secretKey` (the economic identity — and
 * `User.secretKey` does not even exist as a column; this codebase is
 * already non-custodial for economic keys, confirmed directly against
 * `prisma/schema.prisma`'s `User` model). The seed this module persists
 * is generated independently (`crypto.randomBytes(32)`, a fresh random
 * value with no relationship to any economic key), and the resulting
 * keypair is used by `PearNode` for HyperDHT/Hyperswarm transport
 * authentication ONLY — never to sign an `OfferEnvelope`, a `Trade`
 * action, or any settlement-authorizing message (`offer-envelope.ts`'s
 * `signOfferEnvelope()`/`verifyOfferEnvelope()` — the only place any
 * `Offer`-level signature is produced or checked in this codebase —
 * takes its own, separate `ownerPublicKey`/secret material; it never
 * imports or references this module, `PearNode`, or `hyperdht` at all).
 * Economic authority isolation is therefore not merely documented but
 * structurally true: there is no code path by which this node identity's
 * private key could be used to create, cancel, or sign on behalf of an
 * Offer owner, buyer, seller, or settlement authority.
 *
 * **Storage:** a plain local directory
 * (`config.pear.nodeIdentityStorageDir`, default `./data/node-identity`,
 * the identical `./data/<name>` + env-var-override convention already
 * established by `evidence-provider.ts`'s `LocalFilesystemEvidenceProvider`)
 * — deliberately NOT a cloud KMS or external secret-store dependency;
 * none is required to solve local persistence, and forcing one would be
 * a mandatory external dependency this reference implementation does not
 * need (Rube Goldberg discipline: the minimal correct mechanism for "the
 * same process, restarted, should read back the same 32 bytes it wrote"
 * is a file). One seed file per node identity, named by `ownerUserId`
 * (this repository's `PearNode` is one-node-per-active-user today, per
 * `PearNodeRegistry`'s own design — persisting per-owner is the minimal
 * change matching that existing shape, not a redesign of it; see this
 * module's own residuals in `docs/PERSISTENT_NODE_IDENTITY_EVIDENCE.md`
 * for the "is a single server-wide node identity ever needed instead"
 * question, explicitly not decided here).
 *
 * **Corruption / missing-secret behavior, both deliberately explicit
 * rather than silently permissive (per instruction: never regenerate
 * silently and let the operator believe it's the same node):**
 * - Seed file **absent entirely** → treated as first initialization only
 *   (there is no prior claimed identity to contradict): a new seed is
 *   generated and persisted, and a WARN-level log line is always emitted
 *   naming the newly-derived `peerId` — an operator who did NOT expect a
 *   new identity (e.g. their data directory was lost) has a concrete,
 *   loud signal to notice, even though this module cannot cryptographically
 *   distinguish "genuine first boot" from "the file was lost" by itself
 *   (named explicitly as a residual, not solved here — no external
 *   registry is introduced to solve it, per explicit instruction).
 * - Seed file **present but the wrong length** → thrown as
 *   `NodeIdentityCorruptedError`, loudly, never silently discarded or
 *   silently regenerated. `PearNode.start()` propagates this — a
 *   corrupted node identity fails the start-up, it does not silently
 *   masquerade as a fresh (different) or a valid (fabricated) identity.
 * - Ordinary restart (file present, correct length) → the identical seed
 *   is reloaded, byte for byte, producing the identical keypair.
 *
 * **Rotation is a separate, not-yet-authorized operation.** This module
 * does not provide a "rotate this node's identity" API — the only way to
 * force a new identity today is to delete the seed file, which is
 * indistinguishable, from this module's own perspective, from data loss
 * (see the corruption/missing-secret note above). A deliberate,
 * safety-railed rotation mechanism (with old-identity deprecation
 * announcement, grace-period peer-relationship handoff, etc.) is real
 * future work, not implemented or designed here.
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import { randomBytes } from 'crypto'
import HyperDHT from 'hyperdht'
import { config } from '../../config'
import { childLogger } from '../../common/logger'

const log = childLogger('node-identity')

/** `crypto_sign_SEEDBYTES` — confirmed directly against the real, installed `hyperdht`/libsodium: a seed of any other length throws. */
export const NODE_IDENTITY_SEED_BYTES = 32

export class NodeIdentityCorruptedError extends Error {
  constructor(seedPath: string, actualLength: number) {
    super(
      `Node identity seed at "${seedPath}" is corrupted: expected ${NODE_IDENTITY_SEED_BYTES} bytes, found ${actualLength}. ` +
        `This is never silently regenerated — doing so would create a new node identity while the operator believes it is ` +
        `the same one. Restore the correct seed file from backup, or deliberately delete it to accept a new identity.`
    )
    this.name = 'NodeIdentityCorruptedError'
  }
}

function seedPathFor(ownerUserId: string, storageDir: string): string {
  return path.join(storageDir, `${ownerUserId}.seed`)
}

/**
 * Loads this owner's persisted node identity seed, generating and
 * persisting a new one only if none exists yet. Never regenerates a seed
 * that already exists, even a corrupted one (see `NodeIdentityCorruptedError`
 * above) — first-boot generation and "the file already has a different
 * length than expected" are two structurally different states, checked
 * separately.
 */
export async function loadOrCreateNodeIdentitySeed(
  ownerUserId: string,
  storageDir: string = config.pear.nodeIdentityStorageDir
): Promise<Buffer> {
  const seedPath = seedPathFor(ownerUserId, storageDir)

  let existing: Buffer | undefined
  try {
    existing = await fs.readFile(seedPath)
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      // Anything other than "file does not exist" (permission denied,
      // I/O error, etc.) is a real problem this module does not know how
      // to safely recover from — propagate it rather than silently
      // treating it as "absent" and fabricating a new identity.
      throw err
    }
  }

  if (existing) {
    if (existing.length !== NODE_IDENTITY_SEED_BYTES) {
      throw new NodeIdentityCorruptedError(seedPath, existing.length)
    }
    return existing
  }

  // Genuinely absent — first initialization for this ownerUserId (or
  // this data directory was lost; this module cannot tell the difference
  // by itself, hence the loud log line below rather than a silent create).
  const seed = randomBytes(NODE_IDENTITY_SEED_BYTES)
  await fs.mkdir(storageDir, { recursive: true })
  await fs.writeFile(seedPath, seed, { mode: 0o600 })

  const peerId = HyperDHT.keyPair(seed).publicKey.toString('hex')
  log.warn({
    msg: 'New node identity created — this ownerUserId had no prior persisted node identity seed. ' +
      'If a prior identity was expected (this data directory should already have one), this indicates data loss, not a genuine first boot.',
    ownerUserId,
    peerId,
    seedPath,
  })

  return seed
}
