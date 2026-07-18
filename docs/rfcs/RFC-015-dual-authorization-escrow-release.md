# RFC-015: Two-Person Control for Escrow Release

## Summary

Adds an application-layer maker-checker control to
`escrow.service.ts`'s `releaseFunds()` — the single real function that
moves signed (testnet) USDT out of escrow. On the normal, non-disputed
path, release now requires both of a trade's own two counterparties
(`Trade.buyerId`, `Trade.sellerId`) to have independently recorded
approval first. This is explicitly **not on-chain multisig**: WDK's real
account-abstraction package is single-owner-only, so one seed still
signs the eventual transfer regardless. What this RFC adds is a real,
persisted gate *before* that seed is ever asked to sign. Off by default
behind `config.features.requireDualApprovalForRelease`
(`REQUIRE_DUAL_APPROVAL_RELEASE`), same precedent as every other
behavior-changing flag in this codebase.

Building this also surfaced and fixed a real gap in RFC-014 (shipped
immediately before this RFC, same pass): its capability check lived only
inside `settlement-orchestrator.ts`, silently missing the two other real
callers of `releaseFunds()` — the direct `POST
/v1/settlement/escrow/:id/release` route and `dispute.service.ts`'s
arbitrated release. Both RFC-014's check and this RFC's check now live in
`escrow.service.ts`'s `releaseFunds()` itself, the actual single choke
point. See Decision §1.

## Motivation

Custody in this reference implementation is single-seed:
`wdk-settlement.provider.ts`'s own doc comment already discloses that
`WDK_SEED_PHRASE` controls both the treasury account and every per-trade
escrow sub-account (a two-hop derivation, not independent keys). A rigor
pass across the whole codebase, requested by the project owner ahead of
a Tether technical review, named this directly: *"WDK custody is
single-seed... not real multisig/escrow."* The project owner's own
instruction for this item was specific: make the custody model clear and
defensible to a technical reviewer, "principalmente na prática quando
acontece uma transação p2p entre duas partes" — especially in practice,
for the concrete case of a P2P trade between its own two counterparties.

Before this RFC, a single compromised or malfunctioning seller-side
agent (or a bug in `executeSettlement()`'s own logic) was sufficient to
trigger a real fund release — nothing else needed to agree. That is a
real, honestly-scoped gap, not a hypothetical one: `escrow.service.ts`'s
`releaseFunds()` had exactly one gate before this RFC (RFC-014's
capability check, itself only just added), and none of the identities
capable of triggering it were required to be independent from each
other.

## Alternatives Considered

1. **Real on-chain multisig via `@tetherto/wdk-wallet-evm-erc-4337`.**
   Rejected for this pass — investigated first, not assumed away. Its
   real, compiled TypeScript types
   (`wallet-account-evm-erc-4337.d.ts`) show `WalletManagerEvmErc4337`
   takes a single `_ownerAccount` and `predictSafeAddress(owner: string,
   ...)` — one owner, not a threshold set — despite the underlying Safe
   smart-account infrastructure supporting real multisig when configured
   directly against Safe's own contracts (which this package does not
   expose). Building genuine on-chain multisig would mean deploying and
   configuring Safe contracts with multiple owners outside this package's
   surface — real, valuable work, but a materially larger and riskier
   scope than is safe to rush for custody-critical code in this pass.
   Named explicitly as deferred future work (Reference Implementation
   Plan §5), not silently dropped.
2. **The second approver is a configured `TRUSTED_ARBITRATORS` identity
   (RFC-007 D4), not the trade's own buyer.** Rejected. `TRUSTED_ARBITRATORS`
   is empty by default in most deployments (dispute resolution is opt-in
   infrastructure) — making it the release co-signer would mean dual
   control simply doesn't function until an operator separately
   configures arbitrators, and conflates "who is trusted to unilaterally
   decide a *disputed* trade's outcome" with "who co-approves a *normal*
   trade's own release." The trade's own two counterparties are always
   known, need no extra configuration, and are exactly the "duas partes"
   (two parties) the project owner's own instruction named — using them
   requires no new role system, only fields (`Trade.buyerId`/`sellerId`)
   this codebase already has everywhere.
3. **Require the seller's own participant identity AND the seller's
   agent identity as the two approvers** (rather than buyer + seller).
   Rejected. An agent acts *on behalf of* its participant
   (`wallet-agent.ts`'s own doc comment: `agentId` records *which* agent
   acted, not a second independent will) — in this codebase's threat
   model, a compromised seller-side credential plausibly compromises
   both the participant's session and any agent acting under it
   together, so this pairing doesn't add real independence. Buyer and
   seller are genuinely different people/systems with different
   incentives (the buyer wants their USDT; the seller wants to be sure
   PIX was actually received before releasing collateral) — that's real
   independence, not the same trust root asked to approve itself twice.
4. **Bind each approval to the exact release terms (`toAddress`,
   amount), not just "escrow X, approved."** Rejected for this pass,
   named as a real, deliberate scope cut, not an oversight: today's
   `approveRelease(escrowId, approverId)` records intent-to-approve, not
   a commitment to a specific `toAddress`. A theoretical attack this
   doesn't defend against: both parties approve, then a compromised
   caller supplies a *different* `toAddress` at the actual `releaseFunds()`
   call than either party saw when approving. Closing this fully means
   threading the approval through the exact release parameters (a
   signed approval of specific terms, not just a checkbox) — real,
   valuable, and explicitly deferred (Reference Implementation Plan §5)
   rather than silently claimed as covered by "two-person control."
5. **Enforce unconditionally, no config flag.** Rejected for the same
   reason RFC-014 rejected it: turning this on unconditionally breaks
   the atomic `executeSettlement()` convenience path for every existing
   test, the demo script, and any real deployment today (see Decision §2
   for exactly why) — not a safe default, a broken one.
6. **Gate the check at the route layer (`settlement.routes.ts`) instead
   of inside `escrow.service.ts`.** Rejected — the exact mistake RFC-014
   made and this RFC fixes (Summary, above). `escrowService.releaseFunds()`
   has three real callers; a route-level guard only protects the one HTTP
   path.

## Decision

**1. Both RFC-014's and this RFC's checks live inside
`escrow.service.ts`'s `releaseFunds()`**, not in
`settlement-orchestrator.ts` (where RFC-014's shipped originally) and not
in `settlement.routes.ts`. This is the actual single choke point all
three real callers share:

```typescript
async releaseFunds(escrowId: string, toAddress: string, triggeredBy: string) {
  const escrow = await prisma.escrow.findUnique({ where: { id: escrowId } })
  if (!escrow) throw new NotFoundError('Escrow', escrowId)
  this.assertTransition(escrow.status, 'COMPLETED')

  if (config.features.enforceCapabilities) {
    // RFC-014, relocated — unchanged logic, new location
  }

  if (config.features.requireDualApprovalForRelease && escrow.status === 'PAYMENT_PENDING') {
    const dual = await this.hasDualApproval(escrowId)
    if (!dual) throw new EscrowError('Release blocked: both counterparties must approve first...')
  }

  // ... provider.releaseFunds() unchanged below
}
```

The dual-approval check is conditioned on `escrow.status === 'PAYMENT_PENDING'`
specifically (the pre-transition value, still available at this point) —
an arbitrated release (`DISPUTED → COMPLETED`) always bypasses it,
regardless of the flag. `dispute.service.ts`'s `resolveDispute()` already
restricts who may call it to the one assigned, `TRUSTED_ARBITRATORS`-configured
arbiter; requiring the original two counterparties to *also* agree at
that point would defeat arbitration's entire purpose (if they could
still agree, there would be no dispute to resolve).

**2. New methods on `EscrowService`:**

```typescript
async approveRelease(escrowId: string, approverId: string): Promise<EscrowReleaseApproval> {
  // Validates approverId === trade.buyerId || trade.sellerId, else ForbiddenError.
  // Upserts — idempotent, re-approving is a no-op, not an error.
}
async getReleaseApprovals(escrowId: string): Promise<EscrowReleaseApproval[]>
async hasDualApproval(escrowId: string): Promise<boolean> // count(distinct approverId) >= 2
```

**3. New routes** (`settlement.routes.ts`): `POST
/v1/settlement/escrow/:id/approve-release` (auth required — records the
caller's approval, returns `readyToRelease`) and `GET
/v1/settlement/escrow/:id/release-approvals` (lists current approvals +
`readyToRelease`). Neither route enforces anything itself — recording
approval and deciding whether release may proceed are deliberately
separate (the latter is `releaseFunds()`'s own job, per Decision §1),
consistent with this codebase's existing pattern of thin route handlers
delegating all real logic to the service layer.

**4. New Prisma model, `EscrowReleaseApproval`** (`prisma/schema.prisma`,
`escrow_release_approvals` table) — see `DATABASE.md` for the full
definition and reasoning; `@@unique([escrowId, approverId])` is what
makes `hasDualApproval()`'s plain count safe (no approver can be counted
twice).

**5. What this changes about calling `executeSettlement()`:** with
`REQUIRE_DUAL_APPROVAL_RELEASE=true`, the atomic
`executeSettlement()` convenience function (creates escrow, locks funds,
confirms PIX, releases — all in one synchronous call) will now fail at
its final step, every time, because no approval can exist yet for an
escrow that was only just created moments earlier in the same call. This
is intentional, not a bug: the entire point of a two-person control is a
real gap for two independent identities to act, and an atomic
single-function call has no such gap by construction. A caller that
wants this protection must stop using `executeSettlement()`'s all-in-one
path for the release step and instead: create/lock/confirm (still one
call, unaffected by this flag), wait for both counterparties to call
`approve-release`, then call `POST /v1/settlement/escrow/:id/release`
directly. This is a real, deliberate constraint on how the flag may be
used — documented here rather than discovered by a confused caller later.

**6. The demo script does not turn this flag on.** Unlike RFC-014's
`ENFORCE_CAPABILITIES` (which the demo pre-populates grants for and
stays compatible with), `REQUIRE_DUAL_APPROVAL_RELEASE=true` would break
`pix-to-usdt-flow.ts`'s single-call `executeSettlement()` step by design
(Decision §5) — turning it on there would mean rewriting the demo's own
flow shape, not just adding a setup step. Left off, matching
`AUTO_SETTLE_ON_MATCH`'s precedent of a flag the demo doesn't exercise
either. The mechanism itself is proven by `tests/escrowReleaseControls.test.ts`
instead (13 tests, both RFC-014 and RFC-015's checks, including the
disputed-release bypass) — real code, real assertions, not a demo script
claiming to have run something it didn't.

## Primitives Used or Extended

No new primitive, no protocol surface change. `Escrow` (RFC-007 D3's
`EscrowStatus`) is unchanged — this RFC adds a new, separate table that
gates one existing transition (`releaseFunds()`'s `→ COMPLETED`), the
same category of change RFC-014 already made to the same function.

## Principle Alignment

- **Principle 3 (Non-Custodial by Default):** the protocol still never
  holds funds outside a WDK-signed escrow account — this RFC doesn't
  change custody topology, it changes *who must agree* before the
  existing custody mechanism is invoked to release.
- Honesty about what was and wasn't built, consistent with every prior
  RFC's own discipline: this is explicitly named "two-person control,"
  never "multisig," anywhere in the code comments, this document, or the
  docs it updates (`DEPLOYMENT.md`, `DATABASE.md`, `API_REFERENCE.md`) —
  the underlying blockchain transaction is still one signature.

## Specification

| File | Change |
|---|---|
| `prisma/schema.prisma` | New `EscrowReleaseApproval` model + migration |
| `src/config/index.ts` | New `features.requireDualApprovalForRelease` flag |
| `src/modules/open-settlement/escrow.service.ts` | `approveRelease()`, `getReleaseApprovals()`, `hasDualApproval()`; `releaseFunds()` gains both the relocated RFC-014 check and this RFC's check |
| `src/modules/open-settlement/settlement-orchestrator.ts` | RFC-014's check removed from here (now redundant — lives in `escrow.service.ts`); comment explains why and points to the new location |
| `src/modules/open-settlement/settlement.routes.ts` | `POST /v1/settlement/escrow/:id/approve-release`, `GET /v1/settlement/escrow/:id/release-approvals` |
| `tests/escrowReleaseControls.test.ts` (new) | 13 tests: RFC-014's relocated check (off/reject/allow, plus proving it now protects the direct route), `approveRelease()`'s counterparty validation and idempotency, `hasDualApproval()`, and `releaseFunds()`'s gate (off by default, blocks with 1 approval, allows with 2, bypasses entirely for a `DISPUTED` release) |
| `tests/settlementCapabilityCheck.test.ts` | Removed — tested RFC-014's check at its old (now-incorrect) location; superseded by `tests/escrowReleaseControls.test.ts` |
| `docs/DATABASE.md`, `docs/API_REFERENCE.md` | New table, new routes documented |

## Backward Compatibility

No `protocolVersion` bump. Additive: new table with no prior data to
migrate, new routes, new config flag defaulting to today's exact
behavior (no dual-approval check). `tests/intentCapabilityCheck.test.ts`
(RFC-014's other check, `intentEngine.create()`) is unaffected — that
check was never in the orchestrator and needed no relocation.

## Reference Implementation Plan

1. `EscrowReleaseApproval` model + migration (this pass).
2. `escrow.service.ts`: relocate RFC-014's check, add this RFC's check
   and the three new methods (this pass).
3. Routes + docs (this pass).
4. **Explicitly not this pass, tracked in `BACKLOG.md`:** real on-chain
   multisig via directly-configured Safe contracts (Alternatives
   Considered #1); binding an approval to the exact release terms
   (`toAddress`/amount) rather than a bare escrow-scoped checkbox
   (Alternatives Considered #4); a UI/notification so a counterparty
   actually knows they need to call `approve-release` (today: they must
   already know to poll `GET .../release-approvals` or be told
   out-of-band); extending two-person control to `refundFunds()`
   (currently only `releaseFunds()` is gated — a refund moves the same
   real funds back, and arguably deserves the same control, but was kept
   out of scope for this pass to keep the change reviewable).
