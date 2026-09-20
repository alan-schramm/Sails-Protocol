/**
 * EvidenceProvider — Sails OpenProof, RFC-007 D2 (RWR-002). Closed
 * 2026-08-04. A new Adapter category, the same pattern as
 * `SettlementProvider` (§1.5) — the protocol never stores media itself;
 * each Reference Implementation chooses (and can swap) its own provider.
 *
 * `store()`/`retrieve()` deliberately return/accept less than the RFC's
 * literal `EvidenceReference` shape — `proofId` and `signature` are not
 * something a storage backend can know or produce (they come from
 * `proof.service.ts`'s caller, not from wherever the bytes end up), so
 * this interface only covers what a provider genuinely owns: putting
 * bytes somewhere and computing a real hash of what actually got stored.
 * `proof.service.ts`'s `attachEvidence()` is what assembles the full
 * `EvidenceReference` row from a provider's `StoredMedia` result plus the
 * caller-supplied `proofId`/`signature`.
 *
 * `LocalFilesystemEvidenceProvider` is the real, always-available
 * default — same role `InMemoryEventStore` plays for RFC-010: genuinely
 * functional with zero external credentials, a disclosed limitation for
 * a multi-instance deployment (each app instance would need the same
 * shared disk/volume — this codebase makes the identical tradeoff
 * explicit for `redis-memory-server`-backed local dev elsewhere). It
 * REMAINS a legitimate dev/reference implementation — it is NOT
 * production-ready (no multi-instance story, not durable across
 * container restart/redeploy; see `config/index.ts`'s own FATAL guard,
 * Issue #265).
 *
 * Issue #265 — `S3EvidenceProvider` (`s3-evidence-provider.ts`) is the
 * production-capable implementation of this exact same interface,
 * generic S3-compatible (works against AWS S3, Cloudflare R2, MinIO, or
 * any other S3-compatible vendor via `endpoint`) — swapping it in
 * requires no change to `proof.service.ts` or `EvidenceReference`'s
 * shape. `evidenceProvider` below selects between the two based on
 * `config.proof.evidenceProviderType`.
 */
import { createHash } from 'crypto'
import { promises as fs, constants as fsConstants } from 'fs'
import * as path from 'path'
import { config } from '../../config'
import { EvidenceStorageError } from '../../common/errors'
import { S3EvidenceProvider } from './s3-evidence-provider'

export interface StoredMedia {
  provider: string
  uri: string
  sha256: string // real hash of the bytes actually written, recomputed here — never trusted from the caller
}

// Issue #265 CTO Gate R2, CONTRACT DELTA 4 — the smallest observability
// shape the frozen contract needs: "is the configured backend reachable
// right now." Not a metrics/monitoring payload, not wired into
// `app.ts`'s `/health` route (deliberately still static — no existing
// dependency in this codebase gets a live health-check there; see
// `EvidenceProvider.health()`'s own comment below) — a provider-level
// primitive only, for whatever operational tooling needs it directly.
export interface EvidenceProviderHealth {
  healthy: boolean
  detail?: string
}

export interface EvidenceProvider {
  providerName: string
  store(media: Uint8Array, mimeType: string): Promise<StoredMedia>
  // Issue #265 Step 4 — a pure byte fetch. Hash verification against the
  // canonical `EvidenceReference.sha256` is deliberately NOT done here —
  // "storage provider retrieves bytes; OpenProof/service layer verifies
  // them... do not let a storage backend become the source of evidence
  // truth" (see `proof.service.ts`'s `retrieveVerifiedEvidence()`).
  // Throws `EvidenceStorageError` with `storageReason` 'NOT_FOUND'
  // (positive confirmation of absence) or 'UNAVAILABLE' (the provider
  // could not answer at all) — the two are never collapsed together.
  retrieve(uri: string): Promise<Uint8Array>
  // Issue #265 Step 9 — delete CAPABILITY only, not an automatic
  // retention/TTL policy (#234 has not frozen a retention duration or
  // erasure policy; this just makes deletion architecturally possible
  // once one exists). Idempotent: deleting an already-absent object
  // must NOT throw NOT_FOUND — mirrors S3's own real `DeleteObject`
  // semantics, the vendor-neutral choice.
  delete(uri: string): Promise<void>
  // Issue #265 CTO Gate R2, CONTRACT DELTA 4 — a real, minimal
  // reachability check against the CONFIGURED backend (not any specific
  // stored object): can this provider actually be reached right now.
  // Never throws — a health check that itself throws is not one a
  // caller can safely call without its own try/catch; failure is always
  // reported via `healthy: false`.
  health(): Promise<EvidenceProviderHealth>
}

export class LocalFilesystemEvidenceProvider implements EvidenceProvider {
  providerName = 'local-fs'

  constructor(private readonly storageDir: string = config.proof.evidenceStorageDir) {}

  async store(media: Uint8Array, mimeType: string): Promise<StoredMedia> {
    const sha256 = createHash('sha256').update(media).digest('hex')
    await fs.mkdir(this.storageDir, { recursive: true })
    // Content-addressed filename — the same bytes always land at the
    // same path, so storing identical evidence twice is a cheap no-op
    // overwrite of an identical file, not accumulating duplicates on
    // disk (ProofRegistry, D1, is the real duplicate-*detection*
    // mechanism; this is just a side effect of content-addressing, not
    // a substitute for it).
    const extension = mimeTypeExtension(mimeType)
    const filename = `${sha256}${extension}`
    const filePath = path.join(this.storageDir, filename)
    await fs.writeFile(filePath, media)

    return { provider: this.providerName, uri: filePath, sha256 }
  }

  async retrieve(uri: string): Promise<Uint8Array> {
    try {
      return await fs.readFile(uri)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new EvidenceStorageError(`Evidence not found at ${uri}`, 'NOT_FOUND')
      }
      throw new EvidenceStorageError(`Evidence storage unavailable for ${uri}: ${(err as Error).message}`, 'UNAVAILABLE')
    }
  }

  async delete(uri: string): Promise<void> {
    try {
      await fs.unlink(uri)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return // idempotent — already absent is success, not NOT_FOUND
      throw new EvidenceStorageError(`Evidence storage unavailable while deleting ${uri}: ${(err as Error).message}`, 'UNAVAILABLE')
    }
  }

  async health(): Promise<EvidenceProviderHealth> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true })
      await fs.access(this.storageDir, fsConstants.W_OK)
      return { healthy: true }
    } catch (err) {
      return { healthy: false, detail: (err as Error).message }
    }
  }
}

// Issue #265 — S3EvidenceProvider (s3-evidence-provider.ts) keeps its
// own copy of this exact same tiny lookup rather than importing it from
// here: importing it here would create evidence-provider.ts <->
// s3-evidence-provider.ts circular module dependency (this file already
// imports S3EvidenceProvider for createEvidenceProvider() below). Both
// copies mirror the same RFC-007 5-value mimeType enum; if that enum
// ever changes, both call sites need updating regardless of where the
// function lives.
function mimeTypeExtension(mimeType: string): string {
  const known: Record<string, string> = {
    image: '.bin', // real extension unknown from the coarse mimeType category alone (RFC-007's own 5-value enum, not a full MIME type) — .bin is honest, not guessed
    video: '.bin',
    document: '.bin',
    ocr: '.txt',
    external_reference: '.bin',
  }
  return known[mimeType] ?? '.bin'
}

// Issue #265 — production cannot silently fall back to local filesystem;
// `config/index.ts`'s own FATAL boot guard refuses to start a production
// process with `evidenceProviderType === 'local-fs'`, so by the time this
// module loads in production, config already guarantees 's3'.
function createEvidenceProvider(): EvidenceProvider {
  if (config.proof.evidenceProviderType === 's3') {
    return new S3EvidenceProvider(config.proof.evidenceS3)
  }
  return new LocalFilesystemEvidenceProvider()
}

export const evidenceProvider: EvidenceProvider = createEvidenceProvider()

// Issue #265 CTO Gate R2, BLOCKER 3 — `evidenceProvider` above answers
// "which backend should NEW evidence be written to" (this deployment's
// current `EVIDENCE_PROVIDER` config). It must never be used to decide
// how to READ AN EXISTING `EvidenceReference` — that reference already
// names its own backend (`EvidenceReference.provider`), and a
// deployment's write-side config can change (local-fs in early dev,
// later switched to s3) while old references still point at whatever
// they were actually stored under. Blindly reading every reference
// through "whatever `evidenceProvider` currently is" would silently
// query the wrong backend for anything written before a provider
// switch — this resolver is the fix: dispatch strictly on the
// reference's own recorded label.
//
// Deliberately NOT a general plugin registry — exactly the two labels
// this codebase's own `EvidenceProvider` implementations can produce.
// `LocalFilesystemEvidenceProvider` is always constructible (no external
// credentials required — the same property that makes it the legitimate
// dev/reference default); the s3 instance is only constructible when
// `config.proof.evidenceS3` is actually populated — a deployment that
// never configured `EVIDENCE_S3_*` (e.g. one still on `local-fs`) has no
// way to serve an `'s3'`-labeled reference and must say so explicitly,
// never silently substitute a different backend or crash with an
// unrelated SDK error.
const localFsProviderForRetrieval = new LocalFilesystemEvidenceProvider()
let cachedS3ProviderForRetrieval: S3EvidenceProvider | undefined

function isEvidenceS3Configured(): boolean {
  const { bucket, accessKeyId, secretAccessKey } = config.proof.evidenceS3
  return bucket !== '' && accessKeyId !== '' && secretAccessKey !== ''
}

export function resolveEvidenceProviderByLabel(providerLabel: string): EvidenceProvider {
  if (providerLabel === 'local-fs') return localFsProviderForRetrieval
  if (providerLabel === 's3') {
    if (!isEvidenceS3Configured()) {
      throw new EvidenceStorageError(
        `EvidenceReference provider 's3' cannot be resolved: this deployment has no EVIDENCE_S3_* configuration`,
        'UNAVAILABLE'
      )
    }
    if (!cachedS3ProviderForRetrieval) cachedS3ProviderForRetrieval = new S3EvidenceProvider(config.proof.evidenceS3)
    return cachedS3ProviderForRetrieval
  }
  throw new EvidenceStorageError(
    `EvidenceReference provider '${providerLabel}' is not a recognized evidence storage backend — refusing to guess which one to read it from`,
    'UNAVAILABLE'
  )
}
