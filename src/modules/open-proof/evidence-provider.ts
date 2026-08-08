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
 * explicit for `redis-memory-server`-backed local dev elsewhere). A real
 * S3/R2/IPFS/Arweave provider is a separate, still-unbuilt implementation
 * of this exact interface — swapping one in requires no change to
 * `proof.service.ts` or `EvidenceReference`'s shape.
 */
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import * as path from 'path'
import { config } from '../../config'

export interface StoredMedia {
  provider: string
  uri: string
  sha256: string // real hash of the bytes actually written, recomputed here — never trusted from the caller
}

export interface EvidenceProvider {
  providerName: string
  store(media: Uint8Array, mimeType: string): Promise<StoredMedia>
  retrieve(uri: string): Promise<Uint8Array>
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
    return fs.readFile(uri)
  }
}

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

export const evidenceProvider: EvidenceProvider = new LocalFilesystemEvidenceProvider()
