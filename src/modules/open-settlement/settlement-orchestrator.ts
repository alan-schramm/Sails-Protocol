/**
 * Sails OpenSettlement — Settlement Orchestrator
 *
 * `executeSettlement()`: the single real entrypoint that carries a matched
 * Trade through escrow creation, the seller locking collateral, the
 * (emulated) PIX receipt confirmation, and the seller's agent releasing
 * USDT — a real, digitally signed on-chain transfer via
 * `wdk-settlement.provider.ts`'s `WdkSettlementProvider`
 * (`@tetherto/wdk-wallet-evm`), reached through `escrow.service.ts`'s
 * already-real `releaseFunds()`.
 *
 * Naming note, checked against the actual npm registry before writing any
 * import (this codebase's standing rule — never guess a package name):
 * `@tetherto/wdk-core` does not exist as a published package. The closest
 * real match is `@tetherto/wdk` (keywords `["wdk","core"]`, "a flexible
 * manager that can register and manage multiple wallet instances for
 * different blockchains dynamically") — a multi-chain umbrella manager,
 * not itself what signs an EVM transfer. `wdk-settlement.provider.ts`
 * already uses the correct, chain-specific package for that:
 * `@tetherto/wdk-wallet-evm`'s `WalletManagerEvm`, which is what actually
 * derives the seller's escrow-account keypair and signs the transfer
 * locally (`WalletAccountEvm.transfer()` — real, not mocked, verified
 * against the package's own API before that file was written). This
 * orchestrator reuses that existing real signing path via
 * `escrowService.releaseFunds()` rather than introducing a second,
 * redundant WDK integration.
 *
 * "Quando o motor P2P der 'Match'": in this reference implementation's
 * actually-built code (not the aspirational Intent Engine `MATCHED` state,
 * which has no real matching engine wired to it yet — BACKLOG.md's
 * Coordination Engine entry), the real match event is
 * `openp2p.trade.created` (`trade.service.ts`'s `createTrade()`, fired the
 * moment a counterparty accepts an `Offer`). `common/events/handlers.ts`
 * wires that event to this function, gated behind
 * `config.features.autoSettleOnMatch` (default `false`) — see that file's
 * own comment for why this is not unconditional. This function itself
 * has no opinion on how it's invoked: a route, the demo script, or an
 * agent can all call it directly too.
 *
 * PIX receipt is emulated, not integrated with a real payment rail —
 * `emulateSellerPixReceipt()` below produces a clearly-labeled synthetic
 * confirmation object (`emulated: true`), not a silent stand-in dressed
 * up as real. A real integration is Sails OpenProof's job (RFC-003,
 * Claim/Proof/Verification), still 📋 future — this orchestrator does not
 * pretend to have built that.
 */
import { prisma } from '../../common/database'
import { NotFoundError } from '../../common/errors'
import type { AssetType } from '../../common/types'
import type { EscrowType } from '../../common/types/trade'
import { escrowService } from './escrow.service'

export interface ExecuteSettlementInput {
  tradeId: string
  // Where the seller's signed WDK transfer sends the USDT — this
  // reference implementation doesn't onboard per-user EVM addresses yet
  // (wdk-settlement.provider.ts's own doc comment), so callers supply it
  // explicitly rather than this function inventing a lookup that doesn't
  // exist.
  buyerReceivingAddress: string
  // The agent acting on the seller's behalf, if any (WalletAgent.agentId,
  // modules/open-agents/wallet-agent.ts) — recorded as `triggeredBy` on
  // every escrow transition below, the same precedent RFC-012's
  // `Intent.agentId` threading already established: it's just data that
  // flows through, not special-cased. Falls back to the trade's own
  // sellerId when no agent is acting (a human seller, or a route that
  // hasn't been given an agent identity).
  sellerAgentId?: string
  escrowType?: EscrowType // defaults to WDK_USDT_EVM
}

export interface PixReceiptConfirmation {
  emulated: true
  method: 'PIX'
  confirmedBy: string
  confirmedAt: Date
  reference: string
}

export interface ExecuteSettlementResult {
  escrowId: string
  lockTxId: string
  pixConfirmation: PixReceiptConfirmation
  releaseTxId: string
}

// Explicit, labeled emulation — never silently treated as if it were a
// real Sails OpenProof-verified payment claim (RFC-003). `reference` is a
// synthetic identifier, not a real PIX transaction id.
function emulateSellerPixReceipt(confirmedBy: string): PixReceiptConfirmation {
  return {
    emulated: true,
    method: 'PIX',
    confirmedBy,
    confirmedAt: new Date(),
    reference: `emulated-pix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  }
}

export async function executeSettlement(input: ExecuteSettlementInput): Promise<ExecuteSettlementResult> {
  const trade = await prisma.trade.findUnique({ where: { id: input.tradeId } })
  if (!trade) throw new NotFoundError('Trade', input.tradeId)

  const sellerTriggeredBy = input.sellerAgentId ?? trade.sellerId

  // Seller locks USDT collateral — a real, signed WDK transfer
  // (WdkSettlementProvider.lockFunds -> WalletManagerEvm's treasury
  // account transferring to a per-trade escrow sub-account) when
  // escrowType is WDK_USDT_EVM and MOCK_ESCROW=false; MockSettlementProvider
  // otherwise (escrow.service.ts's own provider-selection logic, unchanged
  // here).
  const escrow = await escrowService.createEscrow({
    tradeId: trade.id,
    type: input.escrowType ?? 'WDK_USDT_EVM',
    lockedAmount: trade.amount.toString(),
    asset: trade.asset as AssetType,
  })
  const locked = await escrowService.lockFunds(escrow.id, sellerTriggeredBy)

  // Comprador paga PIX (fora do protocolo — fiat nunca é intermediado,
  // PROJECT_CONTEXT.md §1). markPaymentSent() is the real, existing
  // FUNDS_LOCKED -> PAYMENT_PENDING transition; the buyer is who claims to
  // have sent it.
  await escrowService.markPaymentSent(locked.id, trade.buyerId)

  // The step this function exists to make explicit: the seller (or their
  // agent) confirming PIX was received. Emulated, not a real payment-rail
  // integration — see this file's header comment.
  const pixConfirmation = emulateSellerPixReceipt(sellerTriggeredBy)

  // The seller's agent triggers the real, digitally signed USDT release —
  // escrowService.releaseFunds() -> WdkSettlementProvider.releaseFunds()
  // -> WalletAccountEvm.transfer() (@tetherto/wdk-wallet-evm), a genuine
  // on-chain transaction with a real, checkable hash (testnet).
  //
  // RFC-014's capability check and RFC-015's two-person control both live
  // inside releaseFunds() itself (escrow.service.ts), not here — found
  // while implementing RFC-015 that this orchestrator is not the only
  // real caller of releaseFunds(): settlement.routes.ts's direct
  // POST /v1/settlement/escrow/:id/release and dispute.service.ts's
  // arbitrated resolveDispute() both call it too, and a check placed only
  // here (RFC-014's original location) silently missed both. Both flags
  // (config.features.enforceCapabilities, requireDualApprovalForRelease)
  // default false — see their own doc comments in config/index.ts.
  const released = await escrowService.releaseFunds(locked.id, input.buyerReceivingAddress, sellerTriggeredBy)

  return {
    escrowId: escrow.id,
    lockTxId: locked.txLockId ?? '',
    pixConfirmation,
    releaseTxId: released.txReleaseId ?? '',
  }
}
