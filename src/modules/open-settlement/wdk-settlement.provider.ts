/**
 * Sails OpenSettlement — WDK USDT (EVM) SettlementProvider
 *
 * The first real (non-Mock) `SettlementProvider` implementation
 * (`EscrowType.WDK_USDT_EVM`) — `LightningHodlProvider`/`LiquidCovenantProvider`
 * still throw "not yet implemented" (TODO.md §4); this one is real,
 * using `@tetherto/wdk-wallet-evm`, the actual Tether WDK package.
 *
 * Testnet only — never mainnet. This provider must never be pointed at
 * an RPC/contract holding real value; that boundary is enforced by
 * config (`WDK_RPC_URL` defaults to Sepolia, `.env.example`) and by
 * convention, not by code, since the provider has no way to distinguish
 * "testnet with worthless tokens" from "mainnet with real USDT" other
 * than the RPC URL and contract address it's given.
 *
 * Custody model — stated plainly, not glossed over (same discipline
 * `MOCK`'s own "escrow is theater" config comment already applies):
 * this is a **single-seed, two-hop escrow**, not a trustless multisig.
 * One WDK seed (`WDK_SEED_PHRASE`) controls both the treasury account
 * (index 0) and every per-trade escrow sub-account (a deterministic
 * child derived from the tradeId) — the same key that can lock funds
 * can also move them anywhere. Every lock/release/refund below is a
 * *real* on-chain transfer with a real, checkable transaction hash —
 * what's not yet real is a third, independent party who could stop a
 * bad-faith release. That's the same gap `MULTISIG`'s own "not
 * implemented" status already documents (TODO.md §4); this provider is
 * an honest step between `MOCK` (fakes everything) and a genuine
 * trustless multisig (nobody has built yet), not a claim to have closed
 * that gap.
 */
import WalletManagerEvm, { type WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { createHash } from 'crypto'
import { EscrowError } from '../../common/errors'
import { config } from '../../config'
import type { SettlementProvider } from './escrow.service'

// USDT's real, historically-fixed decimal precision on every EVM chain
// it's deployed on — deliberately not read from the token contract at
// runtime (an extra RPC round-trip for a value that never changes for
// this specific asset). schema.prisma's Decimal(24,8) columns store more
// precision than USDT actually has on-chain; amounts are truncated to 6
// decimals here, not rounded up, so this provider never sends more than
// what was actually locked.
const USDT_DECIMALS = 6

// Exported for direct unit testing (tests/wdkSettlementProvider.test.ts) —
// pure, deterministic, no network/wallet dependency, so they're tested
// directly rather than only indirectly through a mocked wallet.
export function toBaseUnits(decimalAmount: string, decimals: number): bigint {
  const [whole, fraction = ''] = decimalAmount.split('.')
  const truncatedFraction = fraction.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(truncatedFraction || '0')
}

// Deterministic per-trade escrow account index — a BIP-44 non-hardened
// index must fit in 31 bits (0..2^31-1). sha256(tradeId) gives a stable,
// evenly-distributed source; same tradeId always re-derives the same
// escrow account, which is what lets releaseFunds()/refundFunds() find
// the account lockFunds() funded without persisting the derivation path
// anywhere.
export function escrowIndexFor(tradeId: string): number {
  const hash = createHash('sha256').update(tradeId).digest()
  return hash.readUInt32BE(0) % 0x7fffffff
}

export class WdkSettlementProvider implements SettlementProvider {
  name = 'WDK_USDT_EVM'

  private wallet: WalletManagerEvm | null = null

  private getWallet(): WalletManagerEvm {
    if (this.wallet) return this.wallet
    if (!config.wdk.seedPhrase) {
      throw new EscrowError('WDK_USDT_EVM provider requires WDK_SEED_PHRASE configured (.env.example) — refusing to construct a wallet from an empty seed')
    }
    if (!config.wdk.usdtContract) {
      throw new EscrowError('WDK_USDT_EVM provider requires WDK_USDT_CONTRACT configured (.env.example) — no token address to transfer')
    }
    this.wallet = new WalletManagerEvm(config.wdk.seedPhrase, { provider: config.wdk.rpcUrl })
    return this.wallet
  }

  private async treasuryAccount(): Promise<WalletAccountEvm> {
    return this.getWallet().getAccount(0)
  }

  private async escrowAccount(tradeId: string): Promise<WalletAccountEvm> {
    const index = escrowIndexFor(tradeId)
    return this.getWallet().getAccountByPath(`0'/0/${index}`)
  }

  // Demo/inspection helper, not part of the SettlementProvider interface
  // — src/demo/pix-to-usdt-flow.ts uses this to get a real address to
  // release funds to, standing in for a buyer's own independently
  // controlled wallet (this reference implementation doesn't onboard
  // per-user EVM keys yet — see that script's own doc comment).
  async getAccountAddress(index: number): Promise<string> {
    const account = await this.getWallet().getAccount(index)
    return account.getAddress()
  }

  async lockFunds(escrow: { id: string; tradeId: string; lockedAmount: string }): Promise<{ txId: string; address: string }> {
    const treasury = await this.treasuryAccount()
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const escrowAddress = await escrowAcct.getAddress()
    const amount = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)

    const result = await treasury.transfer({
      token: config.wdk.usdtContract,
      recipient: escrowAddress,
      amount,
    })

    return { txId: result.hash, address: escrowAddress }
  }

  async releaseFunds(escrow: { id: string; tradeId: string; lockedAmount: string }, toAddress: string): Promise<{ txId: string }> {
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const amount = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)

    const result = await escrowAcct.transfer({
      token: config.wdk.usdtContract,
      recipient: toAddress,
      amount,
    })

    return { txId: result.hash }
  }

  async refundFunds(escrow: { id: string; tradeId: string; lockedAmount: string }): Promise<{ txId: string }> {
    const treasury = await this.treasuryAccount()
    const treasuryAddress = await treasury.getAddress()
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const amount = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)

    const result = await escrowAcct.transfer({
      token: config.wdk.usdtContract,
      recipient: treasuryAddress,
      amount,
    })

    return { txId: result.hash }
  }

  async verifyLock(escrow: { tradeId: string; lockedAmount: string }): Promise<boolean> {
    const escrowAcct = await this.escrowAccount(escrow.tradeId)
    const balance = await escrowAcct.getTokenBalance(config.wdk.usdtContract)
    const expected = toBaseUnits(escrow.lockedAmount, USDT_DECIMALS)
    return balance >= expected
  }
}

export const wdkSettlementProvider = new WdkSettlementProvider()
