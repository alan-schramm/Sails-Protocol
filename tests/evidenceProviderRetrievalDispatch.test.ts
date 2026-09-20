/**
 * Issue #265 CTO Gate R2, BLOCKER 3 — `resolveEvidenceProviderByLabel()`
 * (`evidence-provider.ts`): `EvidenceReference.provider` + `uri` must
 * select the CORRECT storage backend, never whichever provider this
 * deployment currently writes NEW evidence through
 * (`config.proof.evidenceProviderType`). These tests exercise the
 * resolver directly; `proof.service.ts`'s own use of it (inside
 * `retrieveVerifiedEvidence()`, gated by `assertClaimEconomicScopeAccess()`)
 * is covered separately in `tests/proofService.test.ts`.
 *
 * Each test re-requires `evidence-provider.ts` fresh
 * (`jest.resetModules()`) with its own mocked `config` — the module
 * caches its S3 client instance on first resolution per module
 * lifetime (a correct, deliberate choice for a real long-lived process,
 * where `config.proof.evidenceS3` never changes after boot), so a fresh
 * module per scenario is what actually isolates these tests, the same
 * discipline `tests/configProductionGates.test.ts` already applies to
 * config's own module-load-time behavior.
 */
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

function mockConfig(overrides: {
  evidenceStorageDir: string
  evidenceS3?: Partial<{ endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean }>
}) {
  jest.doMock('../src/config', () => ({
    config: {
      proof: {
        evidenceStorageDir: overrides.evidenceStorageDir,
        evidenceProviderType: 'local-fs',
        evidenceS3: {
          endpoint: '', region: 'auto', bucket: '', accessKeyId: '', secretAccessKey: '', forcePathStyle: true,
          ...overrides.evidenceS3,
        },
      },
    },
  }))
}

describe("resolveEvidenceProviderByLabel('local-fs')", () => {
  let tempDir: string

  beforeEach(async () => {
    jest.resetModules()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sails-evidence-dispatch-'))
    mockConfig({ evidenceStorageDir: tempDir })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('resolves to a working LocalFilesystemEvidenceProvider, independent of any S3 config', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveEvidenceProviderByLabel } = require('../src/modules/open-proof/evidence-provider')
    const provider = resolveEvidenceProviderByLabel('local-fs')
    expect(provider.providerName).toBe('local-fs')

    const media = new Uint8Array(Buffer.from('dispatched to local-fs'))
    const stored = await provider.store(media, 'document')
    const retrieved = await resolveEvidenceProviderByLabel('local-fs').retrieve(stored.uri)
    expect(Buffer.from(retrieved).equals(Buffer.from(media))).toBe(true)
  })
})

describe("resolveEvidenceProviderByLabel('s3')", () => {
  let tempDir: string

  beforeEach(async () => {
    jest.resetModules()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sails-evidence-dispatch-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('resolves to a working S3EvidenceProvider when EVIDENCE_S3_* config is present', async () => {
    mockConfig({
      evidenceStorageDir: tempDir,
      evidenceS3: { bucket: 'dispatch-bucket', accessKeyId: 'k', secretAccessKey: 's', endpoint: 'https://mock.s3.local' },
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
    const objects = new Map<string, Uint8Array>()
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (commandArg: unknown) => {
      const command = commandArg as { input: { Key: string; Body?: Uint8Array } }
      if (commandArg instanceof PutObjectCommand) {
        objects.set(command.input.Key, command.input.Body as Uint8Array)
        return {}
      }
      if (commandArg instanceof GetObjectCommand) {
        return { Body: { transformToByteArray: async () => objects.get(command.input.Key) } }
      }
      throw new Error('unexpected command')
    })

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveEvidenceProviderByLabel } = require('../src/modules/open-proof/evidence-provider')
    const provider = resolveEvidenceProviderByLabel('s3')
    expect(provider.providerName).toBe('s3')

    const media = new Uint8Array(Buffer.from('dispatched to s3'))
    const stored = await provider.store(media, 'document')
    const retrieved = await provider.retrieve(stored.uri)
    expect(Buffer.from(retrieved).equals(Buffer.from(media))).toBe(true)
  })

  it("throws EvidenceStorageError with storageReason UNAVAILABLE when this deployment has no EVIDENCE_S3_* configuration — never silently substitutes a different backend", () => {
    mockConfig({ evidenceStorageDir: tempDir }) // evidenceS3 left at its empty defaults
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveEvidenceProviderByLabel } = require('../src/modules/open-proof/evidence-provider')

    expect(() => resolveEvidenceProviderByLabel('s3')).toThrow(/no EVIDENCE_S3_\* configuration/)
    expect(() => resolveEvidenceProviderByLabel('s3')).toThrow(
      expect.objectContaining({ storageReason: 'UNAVAILABLE' })
    )
  })
})

describe('resolveEvidenceProviderByLabel() — unrecognized provider label', () => {
  let tempDir: string

  beforeEach(async () => {
    jest.resetModules()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sails-evidence-dispatch-'))
    mockConfig({ evidenceStorageDir: tempDir })
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('throws EvidenceStorageError with storageReason UNAVAILABLE for a completely unknown label — never falls back to the currently-configured global provider', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveEvidenceProviderByLabel } = require('../src/modules/open-proof/evidence-provider')

    expect(() => resolveEvidenceProviderByLabel('nostr.build')).toThrow(/not a recognized evidence storage backend/)
    expect(() => resolveEvidenceProviderByLabel('nostr.build')).toThrow(
      expect.objectContaining({ storageReason: 'UNAVAILABLE' })
    )
  })
})

describe('resolveEvidenceProviderByLabel() — historical reference dispatch (the concrete scenario BLOCKER 3 closes)', () => {
  let tempDir: string

  beforeEach(async () => {
    jest.resetModules()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sails-evidence-dispatch-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  it('a reference stored under local-fs is still read through local-fs even once this deployment is fully configured for s3 — never silently queried against s3 instead', async () => {
    mockConfig({
      evidenceStorageDir: tempDir,
      evidenceS3: { bucket: 'now-configured', accessKeyId: 'k', secretAccessKey: 's', endpoint: 'https://mock.s3.local' },
    })
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { S3Client } = require('@aws-sdk/client-s3')
    const s3SendSpy = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolveEvidenceProviderByLabel } = require('../src/modules/open-proof/evidence-provider')

    const media = new Uint8Array(Buffer.from('a real, historical local-fs reference'))
    const stored = await resolveEvidenceProviderByLabel('local-fs').store(media, 'document')
    expect(stored.provider).toBe('local-fs')

    // The deployment's own S3 config is fully present (as it would be
    // after a real provider switch) — resolving the SAME reference by
    // its own recorded 'local-fs' label must still retrieve it from
    // disk, and must never touch the S3 client at all.
    const retrieved = await resolveEvidenceProviderByLabel('local-fs').retrieve(stored.uri)
    expect(Buffer.from(retrieved).equals(Buffer.from(media))).toBe(true)
    expect(s3SendSpy).not.toHaveBeenCalled()
  })
})
