/**
 * Issue #265 Step 8 — contract tests: the same behavior spec run against
 * every `EvidenceProvider` implementation. Proves the two providers are
 * genuinely interchangeable at the `EvidenceProvider` interface boundary
 * (store/retrieve round-trip, content-addressing, not-found semantics,
 * delete semantics), not just individually correct in isolation.
 *
 * `S3EvidenceProvider` is exercised here with `S3Client.prototype.send`
 * mocked to an in-memory bucket — no real S3-compatible credentials are
 * available in this environment. This is CONTRACT/ADAPTER-LOGIC
 * evidence, not live production-provider evidence: see this PR's own
 * report for the explicit "adapter implementation verified" vs. "live
 * production-provider integration not yet externally evidenced"
 * distinction the mission brief requires (Step 8).
 */
import { createHash } from 'crypto'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, NoSuchKey } from '@aws-sdk/client-s3'
import { LocalFilesystemEvidenceProvider } from '../src/modules/open-proof/evidence-provider'
import type { EvidenceProvider } from '../src/modules/open-proof/evidence-provider'
import { S3EvidenceProvider } from '../src/modules/open-proof/s3-evidence-provider'

// In-memory S3 bucket double, keyed by object key. Mocks only the SDK
// wire boundary (`S3Client.prototype.send`) — S3EvidenceProvider's own
// store()/retrieve()/delete() logic runs for real against it, the same
// "mock the boundary, exercise the real implementation" discipline this
// codebase's other tests already apply to Prisma/Redis.
function mockS3ClientSend() {
  const objects = new Map<string, Uint8Array>()
  const sendMock = jest.fn(async (command: unknown) => {
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key as string, command.input.Body as Uint8Array)
      return {}
    }
    if (command instanceof GetObjectCommand) {
      const body = objects.get(command.input.Key as string)
      if (!body) throw new NoSuchKey({ message: 'not found', $metadata: {} })
      return { Body: { transformToByteArray: async () => body } }
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key as string)
      return {}
    }
    throw new Error('unexpected command sent to mock S3 client')
  })
  jest.spyOn(S3Client.prototype, 'send').mockImplementation(sendMock as never)
  return sendMock
}

interface ProviderHarness {
  provider: EvidenceProvider
  cleanup: () => Promise<void>
}

async function makeLocalFsHarness(): Promise<ProviderHarness> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sails-evidence-contract-'))
  return {
    provider: new LocalFilesystemEvidenceProvider(tempDir),
    cleanup: () => fs.rm(tempDir, { recursive: true, force: true }),
  }
}

async function makeS3Harness(): Promise<ProviderHarness> {
  mockS3ClientSend()
  const provider = new S3EvidenceProvider({
    endpoint: 'https://mock.s3.local',
    region: 'auto',
    bucket: 'test-evidence-bucket',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    forcePathStyle: true,
  })
  return { provider, cleanup: async () => { jest.restoreAllMocks() } }
}

describe.each<[string, () => Promise<ProviderHarness>]>([
  ['LocalFilesystemEvidenceProvider', makeLocalFsHarness],
  ['S3EvidenceProvider (mocked SDK boundary)', makeS3Harness],
])('%s — EvidenceProvider contract', (_name, makeHarness) => {
  let provider: EvidenceProvider
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const harness = await makeHarness()
    provider = harness.provider
    cleanup = harness.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  it('store() then retrieve() round-trips the exact same bytes', async () => {
    const media = new Uint8Array(Buffer.from('contract round-trip'))
    const stored = await provider.store(media, 'document')
    const retrieved = await provider.retrieve(stored.uri)
    expect(Buffer.from(retrieved).equals(Buffer.from(media))).toBe(true)
  })

  it('store() returns the real sha256 of the bytes actually written', async () => {
    const media = new Uint8Array(Buffer.from('hash me'))
    const expected = createHash('sha256').update(media).digest('hex')
    const stored = await provider.store(media, 'image')
    expect(stored.sha256).toBe(expected)
  })

  it('is content-addressed — identical bytes stored twice resolve to the same uri', async () => {
    const media = new Uint8Array(Buffer.from('same content'))
    const first = await provider.store(media, 'document')
    const second = await provider.store(media, 'document')
    expect(first.uri).toBe(second.uri)
  })

  it('retrieve() on a reference that was never stored throws EvidenceStorageError with storageReason NOT_FOUND', async () => {
    await expect(provider.retrieve('never-stored-key.bin')).rejects.toMatchObject({ storageReason: 'NOT_FOUND' })
  })

  it('delete() removes the object — a subsequent retrieve() reports NOT_FOUND, not silently stale bytes', async () => {
    const stored = await provider.store(new Uint8Array(Buffer.from('to be deleted')), 'document')
    await provider.delete(stored.uri)
    await expect(provider.retrieve(stored.uri)).rejects.toMatchObject({ storageReason: 'NOT_FOUND' })
  })

  it('delete() is idempotent — deleting an already-absent object does not throw', async () => {
    await expect(provider.delete('already-absent-key.bin')).resolves.toBeUndefined()
  })
})

describe('Provider-contract multi-instance evidence (Issue #265 Step 8)', () => {
  // Contract-level evidence, not literal multi-process execution: two
  // independently constructed provider client instances (the same shape
  // two separate app-server processes would each hold) share nothing in
  // memory — an S3-compatible backend is what makes instance B able to
  // read what instance A wrote, and a mocked bucket exercises exactly
  // that seam (client construction is entirely separate; only the wire
  // request lands in the same in-memory bucket, standing in for the
  // real shared bucket). Explicitly NOT true multi-process evidence —
  // see this PR's own report for the disclosed evidence-quality
  // distinction the mission brief requires.
  it('an object stored by one S3EvidenceProvider instance is retrievable by an independently constructed second instance', async () => {
    mockS3ClientSend()
    const instanceA = new S3EvidenceProvider({
      endpoint: 'https://mock.s3.local', region: 'auto', bucket: 'shared-bucket',
      accessKeyId: 'key-a', secretAccessKey: 'secret-a', forcePathStyle: true,
    })
    const instanceB = new S3EvidenceProvider({
      endpoint: 'https://mock.s3.local', region: 'auto', bucket: 'shared-bucket',
      accessKeyId: 'key-b', secretAccessKey: 'secret-b', forcePathStyle: true,
    })

    const media = new Uint8Array(Buffer.from('written by instance A, read by instance B'))
    const stored = await instanceA.store(media, 'document')
    const retrieved = await instanceB.retrieve(stored.uri)

    expect(Buffer.from(retrieved).equals(Buffer.from(media))).toBe(true)
    jest.restoreAllMocks()
  })
})
