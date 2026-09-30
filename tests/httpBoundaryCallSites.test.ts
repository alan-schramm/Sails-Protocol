// tests/httpBoundaryCallSites.test.ts
//
// The economic callers of boundedFetch(), through their real code, against a real HTTP server on
// 127.0.0.1 standing in for the explorer / bundler (never the public internet). A stalled, partial or
// malformed response is never an answer: each call fails closed within its bound, with the semantics it
// already had (404 on a status read keeps meaning what it meant; nothing new is inferred from a timeout).

import http from 'http'
import type { AddressInfo } from 'net'

const T = 300
const SLACK = 250

type Reply = (req: http.IncomingMessage, res: http.ServerResponse) => void | Promise<void>

describe('HTTP boundary — economic call sites fail closed on stalled or unreadable responses (real HTTP server)', () => {
  let server: http.Server
  let reply: Reply = (_q, res) => { res.end('{}') }
  let hits = 0
  const sockets = new Set<import('net').Socket>()
  const holds: Array<() => void> = []
  let mod: {
    multisig: typeof import('../src/modules/open-settlement/multisig.provider')
    safeGuard: typeof import('../src/modules/open-settlement/safe-guard-evm.provider')
    BoundedRpcTimeoutError: typeof import('../src/modules/open-settlement/bounded-rpc').BoundedRpcTimeoutError
  }
  const env: Record<string, string | undefined> = {}
  const SET = ['MULTISIG_EXPLORER_API_URL', 'MULTISIG_EXPLORER_TIMEOUT_MS', 'SAFE_GUARD_EVM_BUNDLER_URL', 'SAFE_GUARD_EVM_RPC_TIMEOUT_MS']

  beforeAll(async () => {
    server = http.createServer((req, res) => { hits++; res.setHeader('Connection', 'close'); void reply(req, res) })
    server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    for (const k of SET) env[k] = process.env[k]
    process.env.MULTISIG_EXPLORER_API_URL = base
    process.env.MULTISIG_EXPLORER_TIMEOUT_MS = String(T)
    process.env.SAFE_GUARD_EVM_BUNDLER_URL = `${base}/bundler`
    process.env.SAFE_GUARD_EVM_RPC_TIMEOUT_MS = String(T)
    jest.isolateModules(() => {
      mod = {
        multisig: require('../src/modules/open-settlement/multisig.provider'),
        safeGuard: require('../src/modules/open-settlement/safe-guard-evm.provider'),
        BoundedRpcTimeoutError: require('../src/modules/open-settlement/bounded-rpc').BoundedRpcTimeoutError,
      }
    })
  })
  afterEach(async () => {
    for (const h of holds.splice(0)) h()
    await Promise.all([...sockets].map((s) => new Promise<void>((r) => { s.once('close', () => r()); s.destroy() })))
    hits = 0
  })
  afterAll(async () => {
    for (const k of SET) { if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k] }
    await new Promise<void>((r) => server.close(() => r()))
  })

  /** Headers now, then a body that never completes (until the test's teardown). */
  const stalledBody = (status = 200, partial = ''): Reply => async (_q, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' })
    if (partial) res.write(partial); else res.flushHeaders()
    await new Promise<void>((r) => holds.push(r))
    if (!res.destroyed) res.end()
  }
  async function timed<T>(op: () => Promise<T>): Promise<{ ms: number; value?: T; error?: any }> {
    const t0 = Date.now()
    try { const value = await op(); return { ms: Date.now() - t0, value } } catch (error) { return { ms: Date.now() - t0, error } }
  }
  const txid = 'ab'.repeat(32)

  // ─── MULTISIG explorer reads (PASS 0 / PASS 1 / reorg sweeps) ──────────────────────────────────────────

  it('existence read: a stalled body fails with BoundedRpcTimeoutError within one attempt\'s bound (never "exists" / "absent")', async () => {
    reply = stalledBody(200, '{"confirmed":')
    const r = await timed(() => mod.multisig.fetchTransactionExistence(txid))
    expect(r.error).toBeInstanceOf(mod.BoundedRpcTimeoutError)
    expect(r.value).toBeUndefined()
    expect(hits).toBe(1) // body phase is not re-issued
    expect(r.ms).toBeLessThan(T + SLACK)
  })

  it('existence read keeps its existing semantics: 404 -> exists:false, 5xx -> throws after its bounded retries, malformed JSON -> throws', async () => {
    reply = (_q, res) => { res.writeHead(404); res.end() }
    expect(await mod.multisig.fetchTransactionExistence(txid)).toEqual({ exists: false, confirmed: false })
    hits = 0
    reply = (_q, res) => { res.writeHead(503); res.end() }
    await expect(mod.multisig.fetchTransactionExistence(txid)).rejects.toThrow(/503/)
    expect(hits).toBe(3)
    reply = (_q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{oops') }
    await expect(mod.multisig.fetchTransactionExistence(txid)).rejects.toBeDefined()
  })

  it('confirmation-status, outputs, outspend and tip-height reads: a stalled body never becomes a value', async () => {
    reply = stalledBody()
    for (const call of <Array<() => Promise<unknown>>>[
      () => mod.multisig.fetchTransactionConfirmationStatus(txid),
      () => mod.multisig.fetchTransactionOutputs(txid),
      () => mod.multisig.fetchOutpointSpendStatus(txid, 0),
      () => mod.multisig.fetchChainTipHeight(),
    ]) {
      const r = await timed(call)
      expect(r.error).toBeInstanceOf(mod.BoundedRpcTimeoutError)
      expect(r.ms).toBeLessThan(T + SLACK)
    }
  })

  it('UTXO read (PASS 0 / PASS 1 outpoint check): a stalled body fails closed, never "unspent" / "spent"', async () => {
    reply = stalledBody(200, '[{"txid":')
    const r = await timed(() => (mod.multisig.multisigProvider as any).fetchUtxos('tb1qexample'))
    expect(r.error).toBeInstanceOf(mod.BoundedRpcTimeoutError)
    expect(r.ms).toBeLessThan(T + SLACK)
  })

  it('MULTISIG broadcast: an accepted response whose body stalls fails (outcome unknown to the caller), within one attempt, never retried', async () => {
    reply = stalledBody(200)
    const r = await timed(() => (mod.multisig.multisigProvider as any).broadcast('00'))
    expect(r.error).toBeInstanceOf(mod.BoundedRpcTimeoutError)
    expect(hits).toBe(1)
    expect(r.ms).toBeLessThan(T + SLACK)
  })

  it('fee-rate read: a stalled body fails; no fee is guessed', async () => {
    reply = stalledBody(200, '{"halfHourFee":')
    const r = await timed(() => (mod.multisig.multisigProvider as any).fetchFeeRateSatsPerVByte())
    expect(r.error).toBeDefined()
    expect(r.value).toBeUndefined()
    expect(r.ms).toBeLessThan(T + SLACK)
  })

  // ─── SAFE_GUARD_EVM bundler submission (economic write) ────────────────────────────────────────────────

  const userOp = { sender: '0x' + '11'.repeat(20), nonce: 1n, initCode: '0x', callData: '0x', accountGasLimits: '0x' + '00'.repeat(32), preVerificationGas: 1n, gasFees: '0x' + '00'.repeat(32), paymasterAndData: '0x' }
  const submit = () => (mod.safeGuard.safeGuardEvmProvider as any).broadcast(userOp, '0xsig')

  it('bundler: an accepted (200) response whose body stalls is "outcome unknown" (throws -> SUBMISSION_UNKNOWN), never a txid, never retried', async () => {
    reply = stalledBody(200, '{"jsonrpc":"2.0","result":"0x')
    const r = await timed(submit)
    expect(r.error?.message).toMatch(/could not be read.*submission outcome unknown/)
    expect(r.value).toBeUndefined()
    expect(hits).toBe(1)
    expect(r.ms).toBeLessThan(T + SLACK)
  })

  it('bundler: accepted but malformed, or accepted without a userOpHash -> "outcome unknown", never { txId: undefined }', async () => {
    reply = (_q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{not json') }
    await expect(submit()).rejects.toThrow(/could not be read.*submission outcome unknown/)
    reply = (_q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"jsonrpc":"2.0","id":1}') }
    await expect(submit()).rejects.toThrow(/without a userOpHash - submission outcome unknown/)
  })

  it('bundler: rejections keep their existing meaning (JSON-RPC error, or non-2xx with an unreadable body), and a real answer returns its userOpHash', async () => {
    reply = (_q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"jsonrpc":"2.0","id":1,"error":{"message":"AA21 didn\'t pay prefund"}}') }
    await expect(submit()).rejects.toThrow(/bundler rejected the UserOperation.*AA21/)
    reply = (_q, res) => { res.writeHead(502); res.end('<html>bad gateway</html>') }
    await expect(submit()).rejects.toThrow(/bundler rejected the UserOperation/)
    reply = (_q, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"jsonrpc":"2.0","id":1,"result":"0xuserophash"}') }
    await expect(submit()).resolves.toEqual({ txId: '0xuserophash' })
  })
})
