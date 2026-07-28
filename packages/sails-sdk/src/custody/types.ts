/**
 * @sails/sdk — custody provider types (RFC-020, fulfilling RFC-019 Phase 2)
 *
 * `CustodyProvider` is the chain-agnostic abstraction each real custody
 * scheme implements — same minimalist, transport-agnostic spirit as
 * `wallet-adapter.ts`'s existing `WalletAdapter` (a plug-point, not an
 * opinion about *how* signing happens), but a different concern:
 * `WalletAdapter` is "how does a user's own wallet sign for them,"
 * `CustodyProvider` is "how does the ESCROW itself get held and
 * released" — the client-SDK-side mirror of what `SettlementProvider`
 * (`escrow.service.ts`) already is server-side, just typed for a caller
 * driving the flow chain-agnostically instead of hand-rolling HTTP calls
 * per chain.
 *
 * `custodyModel` mirrors the exact convention already established
 * server-side (`multisig.provider.ts`/`lightning-hodl.provider.ts`'s own
 * `readonly custodyModel` field) — every real implementation states its
 * trust model in-band, not just in a doc comment.
 *
 * `PackedUserOperation` — the real ERC-4337 v0.7+ struct, verified field-
 * for-field against the actual installed `@account-abstraction/contracts`
 * package (`interfaces/PackedUserOperation.sol`) before being typed here,
 * not invented. Deliberately the packed (v0.7+) shape, not the older
 * unpacked v0.6 `UserOperation` — `accountGasLimits`/`gasFees` are each a
 * single `bytes32` packing two values, matching the real Solidity struct
 * exactly (`contracts/SailsEscrowSafe.sol`'s own header comment has the
 * full architecture this pairs with).
 *
 * MuSig2 round types match `@scure/btc-signer`'s real `musig2.js` exports
 * directly (`Nonces`, `Session`'s constructor/method shapes) — no
 * invented fields, this package is already a real dependency (pinned
 * `^2.0.1`, used for real by `lightning-hodl.provider.ts`'s Arkade
 * signing).
 */

export interface CustodyProvider {
  readonly custodyModel: string
  createEscrowAccount(params: CreateEscrowAccountParams): Promise<EscrowAccount>
  buildRelease(escrowAccount: EscrowAccount, toAddress: string, amount: string): Promise<UnsignedCustodyAction>
  buildRefund(escrowAccount: EscrowAccount): Promise<UnsignedCustodyAction>
  finalize(unsigned: UnsignedCustodyAction, signatures: string[]): Promise<{ txId: string }>
}

export interface CreateEscrowAccountParams {
  tradeId: string
  buyerPubkey: string
  sellerPubkey: string
  arbiterPubkey: string
  lockedAmount: string // decimal string, RFC-009 — never a JS number
}

export interface EscrowAccount {
  address: string
  custodyModel: string
  // Provider-specific data buildRelease()/buildRefund() need to
  // reconstruct signing context later (e.g. BitcoinCustodyProvider's own
  // per-role hex pubkeys) — same "opaque, per-provider shape" spirit as
  // UnsignedCustodyAction.payload. Optional: ERC4337CustodyProvider
  // doesn't need it, since `address` alone (the Safe's own address) is
  // enough there.
  metadata?: Record<string, string>
}

// The chain-specific unsigned payload a required signer must sign and
// submit back — same "opaque string, format is per-provider" shape
// escrow.service.ts's own EscrowPendingTransaction.unsignedPsbtBase64
// already established (MULTISIG's is a bare PSBT, LIGHTNING_HODL's is a
// JSON bundle — see lightning-hodl.provider.ts's own header comment).
export interface UnsignedCustodyAction {
  requiredSigners: string[]
  payload: string
}

// ERC-4337 v0.7+ packed UserOperation — real struct, see this file's own
// header comment for the verification source.
export interface PackedUserOperation {
  sender: string
  nonce: bigint
  initCode: string // hex
  callData: string // hex
  accountGasLimits: string // bytes32 hex — packed verificationGasLimit/callGasLimit
  preVerificationGas: bigint
  gasFees: string // bytes32 hex — packed maxPriorityFeePerGas/maxFeePerGas
  paymasterAndData: string // hex
  signature: string // hex
}

// MuSig2 (BIP-327) round types — mirrors @scure/btc-signer's musig2.js
// `Nonces` type and `Session` class shape exactly (verified against the
// installed package's own .d.ts before being typed here).
export interface MuSig2Nonces {
  public: Uint8Array
  secret: Uint8Array
}

export interface MuSig2Round {
  aggPublicKey: Uint8Array
  aggNonce: Uint8Array
  publicKeys: Uint8Array[]
  message: Uint8Array
}
