/**
 * LocalFilesystemEvidenceProvider — RFC-007 D2 (RWR-002), closed
 * 2026-08-04. Real filesystem I/O against a real temp directory (not
 * mocked) — the same "genuinely exercise the real implementation, not a
 * fake of it" discipline tests/timeline.test.ts already applies to
 * InMemoryEventStore.
 */
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import { LocalFilesystemEvidenceProvider } from '../src/modules/open-proof/evidence-provider'

describe('LocalFilesystemEvidenceProvider', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sails-evidence-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it('store() writes real bytes to disk and returns the real sha256 of what was written', async () => {
    const provider = new LocalFilesystemEvidenceProvider(tempDir)
    const media = new Uint8Array(Buffer.from('real evidence bytes'))
    const expectedSha256 = createHash('sha256').update(media).digest('hex')

    const result = await provider.store(media, 'document')

    expect(result.provider).toBe('local-fs')
    expect(result.sha256).toBe(expectedSha256)
    const onDisk = await fs.readFile(result.uri)
    expect(onDisk.equals(Buffer.from(media))).toBe(true)
  })

  it('retrieve() returns the exact same bytes that were stored', async () => {
    const provider = new LocalFilesystemEvidenceProvider(tempDir)
    const media = new Uint8Array(Buffer.from('round-trip me'))

    const { uri } = await provider.store(media, 'image')
    const retrieved = await provider.retrieve(uri)

    expect(Buffer.from(retrieved).equals(Buffer.from(media))).toBe(true)
  })

  it('is content-addressed — storing identical bytes twice lands at the same path, not two files', async () => {
    const provider = new LocalFilesystemEvidenceProvider(tempDir)
    const media = new Uint8Array(Buffer.from('same content'))

    const first = await provider.store(media, 'document')
    const second = await provider.store(media, 'document')

    expect(first.uri).toBe(second.uri)
    const files = await fs.readdir(tempDir)
    expect(files).toHaveLength(1)
  })

  it('different content produces different files', async () => {
    const provider = new LocalFilesystemEvidenceProvider(tempDir)
    await provider.store(new Uint8Array(Buffer.from('content A')), 'document')
    await provider.store(new Uint8Array(Buffer.from('content B')), 'document')

    const files = await fs.readdir(tempDir)
    expect(files).toHaveLength(2)
  })

  it('creates the storage directory if it does not exist yet', async () => {
    const nestedDir = path.join(tempDir, 'nested', 'evidence', 'dir')
    const provider = new LocalFilesystemEvidenceProvider(nestedDir)

    await provider.store(new Uint8Array(Buffer.from('data')), 'document')

    const stat = await fs.stat(nestedDir)
    expect(stat.isDirectory()).toBe(true)
  })
})
