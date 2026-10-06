/**
 * #235 R7G-F6B — an in-memory EVM chain double for the WDK LOCK authority (the wdk-rpc.ts boundary).
 *
 * Faithful where the authority depends on it: real ethers decoding of every raw transaction (signer,
 * nonce, chain id, hash recomputed from the bytes), per-account nonces with gaps blocking later nonces,
 * "already known" / "nonce too low" / same-nonce replacement refusal, an ERC-20 transfer that moves token
 * balances or reverts, receipts only for mined transactions, block-tagged nonce history. Everything else
 * (fee markets, eviction policy, reorgs) is not modelled — those are REQUIRES_LIVE_ECONOMIC_REHEARSAL; the
 * local-EVM evidence covers a real node.
 */
import { Interface, Transaction, getAddress } from 'ethers'

const ERC20 = new Interface(['function transfer(address to, uint256 amount) returns (bool)'])

type Pending = { raw: string; hash: string; from: string; nonce: number; to: string | null; data: string; maxFeePerGas: bigint }
type Mined = { hash: string; from: string; nonce: number; blockNumber: number; status: 0 | 1 }

export class WdkChainDouble {
  chainIdValue = 31337n
  head = 0
  readonly mempool = new Map<string, Pending>()
  readonly mined = new Map<string, Mined>()
  readonly minedNonce = new Map<string, number>()
  readonly nonceHistory: Array<Map<string, number>> = [new Map()]
  readonly tokenBalances = new Map<string, bigint>()
  sendCalls: string[] = []
  /** Test hooks. */
  hooks: {
    beforeSend?: (raw: string) => void | 'ACCEPT_THEN_THROW'
    receipt?: (hash: string) => unknown | undefined
    estimateGas?: () => bigint
    pendingNonce?: (address: string) => number | undefined
  } = {}

  constructor(readonly token: string) {}

  fund(address: string, amount: bigint) {
    this.tokenBalances.set(getAddress(address), (this.tokenBalances.get(getAddress(address)) ?? 0n) + amount)
  }
  balance(address: string) {
    return this.tokenBalances.get(getAddress(address)) ?? 0n
  }
  latestNonce(address: string, block?: number) {
    const a = getAddress(address)
    if (block === undefined) return this.minedNonce.get(a) ?? 0
    return this.nonceHistory[Math.min(block, this.head)]?.get(a) ?? 0
  }
  pendingNonce(address: string) {
    const a = getAddress(address)
    let n = this.latestNonce(a)
    const own = [...this.mempool.values()].filter((p) => p.from === a)
    while (own.some((p) => p.nonce === n)) n++
    return n
  }

  sendRaw(raw: string): string {
    this.sendCalls.push(raw)
    const directive = this.hooks.beforeSend?.(raw)
    const tx = Transaction.from(raw)
    if (tx.chainId !== this.chainIdValue) throw new Error(`invalid chain id ${tx.chainId}`)
    const from = getAddress(tx.from!)
    const hash = tx.hash!
    if (this.mined.has(hash) || tx.nonce < this.latestNonce(from)) throw new Error(`nonce too low: next nonce ${this.latestNonce(from)}, tx nonce ${tx.nonce}`)
    if (this.mempool.has(hash)) throw new Error('already known')
    const clash = [...this.mempool.values()].find((p) => p.from === from && p.nonce === tx.nonce)
    if (clash) throw new Error('replacement transaction underpriced')
    this.mempool.set(hash, { raw, hash, from, nonce: tx.nonce, to: tx.to, data: tx.data, maxFeePerGas: tx.maxFeePerGas ?? 0n })
    if (directive === 'ACCEPT_THEN_THROW') throw new Error('socket hang up (response lost after the node accepted the transaction)')
    return hash
  }

  /** A transaction Sails did not sign, from `from`, consuming its next nonce. */
  external(from: string) {
    const a = getAddress(from)
    const nonce = this.pendingNonce(a)
    const hash = `0x${'e'.repeat(56)}${nonce.toString(16).padStart(8, '0')}`
    this.mempool.set(hash, { raw: '', hash, from: a, nonce, to: null, data: '0x', maxFeePerGas: 0n })
    return hash
  }

  drop(hash: string) {
    this.mempool.delete(hash)
  }

  mine(blocks = 1) {
    for (let b = 0; b < blocks; b++) {
      this.head++
      let progressed = true
      while (progressed) {
        progressed = false
        for (const p of [...this.mempool.values()].sort((x, y) => x.nonce - y.nonce)) {
          if (p.nonce !== this.latestNonce(p.from)) continue
          let status: 0 | 1 = 1
          if (p.data !== '0x' && p.to) {
            const d = ERC20.parseTransaction({ data: p.data })!
            const amount = d.args[1] as bigint
            if (getAddress(p.to) !== getAddress(this.token) || this.balance(p.from) < amount) status = 0
            else {
              this.tokenBalances.set(p.from, this.balance(p.from) - amount)
              this.fund(d.args[0] as string, amount)
            }
          }
          this.mempool.delete(p.hash)
          this.mined.set(p.hash, { hash: p.hash, from: p.from, nonce: p.nonce, blockNumber: this.head, status })
          this.minedNonce.set(p.from, p.nonce + 1)
          progressed = true
        }
      }
      this.nonceHistory[this.head] = new Map(this.minedNonce)
    }
  }

  receipt(hash: string): unknown {
    const override = this.hooks.receipt?.(hash)
    if (override !== undefined) return override
    const m = this.mined.get(hash)
    return m ? { transactionHash: hash, blockNumber: `0x${m.blockNumber.toString(16)}`, status: m.status ? '0x1' : '0x0' } : null
  }

  /** The wdk-rpc.ts WdkRpc this double serves. */
  rpc() {
    return {
      chainId: async () => this.chainIdValue,
      blockNumber: async () => this.head,
      nonce: async (address: string, block: 'latest' | 'pending' | number) =>
        block === 'pending' ? (this.hooks.pendingNonce?.(address) ?? this.pendingNonce(address)) : this.latestNonce(address, block === 'latest' ? undefined : block),
      estimateGas: async () => this.hooks.estimateGas?.() ?? 60_000n,
      feeData: async () => ({ maxFeePerGas: 3_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
      sendRawTransaction: async (raw: string) => this.sendRaw(raw),
      receipt: async (hash: string) => this.receipt(hash),
    }
  }

  /** Distinct signed transactions ever presented for broadcast, by hash. */
  distinctBroadcastHashes(): Set<string> {
    return new Set(this.sendCalls.map((raw) => Transaction.from(raw).hash!))
  }
}
