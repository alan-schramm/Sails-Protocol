# Sails Design System v1

## 1. Purpose and Scope

`packages/sails-ui` is the reusable design-system and UI layer for Sails Protocol integrations.

Its job is to let wallets, marketplaces, private coordination spaces, and other host applications compose complete P2P economic journeys without having to invent the core UX semantics from scratch.

This document is the institutional source of truth for the visual, interaction, accessibility, semantic, and composition rules of `sails-ui`.

It is normative. When this document conflicts with older screenshots, prototypes, or local implementation conventions, this document wins unless repository evidence proves a protocol contradiction.

Sails Market is the reference application for this system. It demonstrates complete product patterns, but `sails-ui` MUST remain reusable and white-label. The library MUST NOT impose the Sails Market app shell, navigation model, routing structure, or product branding on integrators.

---

## 2. Normative Language

The keywords MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are used intentionally.

- **MUST / MUST NOT**: required to preserve economic truth, accessibility, or architectural consistency.
- **SHOULD / SHOULD NOT**: strong default; deviations require a concrete product reason.
- **MAY**: optional behavior compatible with the system.

---

## 3. Institutional Principles

### Familiar Before Novel
Interfaces SHOULD use interaction models users already understand when those models preserve Sails semantics. Novelty is justified only when the underlying coordination model requires it.

### Information Before Decoration
Financial and coordination information MUST dominate visual decoration.

### Trust Must Be Visible
Identity, verification, reputation, provenance, authority, and freshness MUST be representable where they affect economic decisions.

### Dense, Never Crowded
The system SHOULD support high information density without collapsing hierarchy or touch/accessibility requirements.

### Adaptive by Composition
Responsive behavior MUST rearrange semantic compositions, not simply squeeze desktop layouts into narrower viewports.

### Brandable, Not Brandless
The default Sails identity is strong enough to be recognizable while the system remains deeply themeable for integrators.

### Motion Explains State
Motion MUST communicate transition, hierarchy, continuity, or state change. Decorative motion that competes with transactional comprehension SHOULD NOT be used.

### States Are Part of the Component
A component is incomplete until its relevant loading, empty, stale, unavailable, error, conflict, disabled, focus, selected, pressed, and responsive states are defined.

---

## 4. Truth and Economic Semantics

These invariants are foundational:

> **Protocol defines truth. UI represents truth.**

> **Economic State Before Interface State.**

> **Evidence is not truth.**

> **Recommendation is not decision.**

> **Actor is not authority.**

> **Payment sent is not payment verified.**

> **AgreedTerms is not Trade.**

> **Ruling is not Settlement.**

> **Cancel is not Undo.**

> **Unknown is not Failure.**

> **Absence of evidence is not negative evidence.**

> **Degrade capability, not user understanding.**

The visual system MUST NOT manufacture states, guarantees, verification, reputation, settlement progress, or authority not supported by the domain.

UI state such as a selected offer, open panel, expanded section, or pending local form MUST NOT be presented as protocol state.

---

## 5. Foundations

### 5.1 Typography

The default type system is:

- **Geist**: primary UI typeface.
- **Space Grotesk**: brand/display moments.
- **Geist Mono**: technical identifiers and machine-oriented detail.
- **Tabular numerals**: financial values where alignment improves readability.

Financial amounts MUST NOT default to monospace. They SHOULD use Geist with tabular numerals.

Recommended weights:

- 400: body
- 500: labels and supporting emphasis
- 600: interface emphasis and section headings
- 700: strong headings and brand/display moments

The system MUST remain resilient in Portuguese, Spanish, and English, and SHOULD use logical start/end layout primitives so future RTL support is not structurally blocked.

Hosts MAY override font families through theming, provided hierarchy and accessibility are preserved.

### 5.2 Color Architecture

The default Sails brand uses:

- **Orange** as the primary brand color.
- **Blue** as the supporting brand color and a common informational family.

Brand color, semantic color, trade-side color, and asset/network identity MUST remain separate token namespaces.

Required semantic families:

- **Success**: green
- **Warning**: yellow
- **Danger / destructive**: red
- **Information / processing**: blue

Trade-side semantics MUST be distinct from lifecycle semantics:

- `trade.buy`
- `trade.sell`

A BUY action is not semantically the same as success.
A SELL action is not semantically the same as danger.

Asset and network identities MAY use official brand colors and logos. Those colors MUST NOT be remapped to fit the host theme when that would destroy asset/network recognition.

Exact brand hex values are intentionally **unfrozen** until visual prototyping and WCAG validation are completed.

### 5.3 Neutral Surfaces

Neutral surfaces SHOULD dominate economic interfaces.

Semantic surface roles:

- `canvas`
- `surface.primary`
- `surface.secondary`
- `surface.raised`
- `surface.overlay`
- `surface.sunken`

Light and dark modes MUST each be intentionally specified. Dark mode MUST NOT be treated as a mechanically inverted light theme.

### 5.4 Spacing

The base spatial rhythm is 4px.

Semantic spacing steps:

- 4
- 8
- 12
- 16
- 24
- 32
- 48
- 64

Use semantic spacing tokens rather than arbitrary one-off gaps.

### 5.5 Density

The system supports context-driven density:

- **Compact**
- **Default**
- **Comfortable**

Dense marketplace and trading surfaces MAY use compact density.
Forms, review boundaries, signing, dispute, and evidence flows SHOULD increase breathing room when comprehension matters more than scan speed.

Interactive touch targets SHOULD remain approximately 44px minimum unless a platform-specific accessibility standard requires more.

### 5.6 Grid and Containers

Conceptual responsive grids:

- 4 columns
- 8 columns
- 12 columns

Container roles:

- standard
- wide
- full

Components SHOULD be container-aware. Host applications are viewport-aware.

### 5.7 Progressive Disclosure

Information hierarchy SHOULD use:

- **L1**: decision-critical
- **L2**: contextual
- **L3**: technical/advanced

Technical provenance, hashes, raw transaction identifiers, model/runtime details, or cryptographic information SHOULD be progressively disclosed unless required for the current decision.

---

## 6. Shapes, Surfaces, and Elevation

### 6.1 Radius Scale

Default radius scale:

- 0
- 2
- 4
- 6
- 8
- full

The system SHOULD avoid uniformly oversized, bubbly radii.

Different semantic surfaces MAY use different radius levels. There is no rule that every card, field, row, and overlay shares one radius.

### 6.2 Elevation

The system is **flat by default**, but shadows are not categorically prohibited.

Elevation MAY be used when it communicates spatial hierarchy, especially for overlays and transient surfaces.

A shadow MUST NOT exist purely for decoration when borders or surface hierarchy already communicate the relationship.

### 6.3 Interaction States

These states MUST remain semantically distinct:

- hover
- focus
- selected
- pressed
- current
- disabled

Do not use the same styling to communicate all of them.

### 6.4 Overlay Taxonomy

Canonical overlay roles:

- Dialog
- Sheet
- Drawer
- Popover
- Menu
- Tooltip

An overlay MUST NOT hide information necessary to understand the economic consequence of its own action.

---

## 7. Iconography and Visual Semantics

Icon families:

- System
- Domain
- Status
- Identity
- Asset / Network

The default icon style SHOULD be neutral and Lucide-like, abstracted through a system-level `Icon` component rather than direct dependency leakage throughout product code.

Reference sizes:

- 16px
- 20px
- 24px

Typical stroke weight: approximately 1.5–2.

### Badge, Status, Metric

These are not interchangeable:

- **Badge**: categorical/credential label.
- **Status**: current state.
- **Metric**: measured value.

Critical status MUST NOT rely on color alone. Use icon + text + color when appropriate.

### Avatar, Verification, Reputation

These are independent:

- Avatar identifies or humanizes.
- Verification communicates an evidence-backed verification claim.
- Reputation communicates historical/performance context.

An avatar MUST NOT visually imply verification or trust.

---

## 8. Motion

Motion exists to explain change.

Reference duration bands:

- instant: ~0–80ms
- fast: ~120–160ms
- normal: ~180–240ms
- slow: ~280–360ms

Exact durations are **unfrozen** pending prototype validation.

Avoid arbitrary `transition: all`.

Valid uses include:

- panel continuity
- state replacement
- expanding/collapsing detail
- current timeline focus
- asynchronous result arrival

Do not use motion to imply progress that the protocol cannot observe.

Skeletons SHOULD reflect component anatomy.

Confetti, slot-machine motion, artificial urgency, and casino-like celebration MUST NOT be used in financial state transitions.

`prefers-reduced-motion` MUST be respected.

---

## 9. Accessibility

WCAG 2.2 AA is the minimum target, augmented by transactional clarity requirements.

The system MUST support:

- visible focus
- keyboard-first desktop operation
- color-independent state communication
- accessible names and descriptions
- semantic error messaging
- dialog/sheet focus management
- screen-reader-friendly timers and timelines
- touch target adequacy
- reduced motion
- PT/ES/EN localization stress

### Transactional Clarity

Before a consequential financial action, the user SHOULD be able to understand, where applicable:

- action
- direction
- asset
- amount
- network / rail
- fiat or counter-asset
- counterparty
- fees
- settlement or custody consequence

Critical buttons SHOULD be explicit:

- `Accept offer`
- `Mark payment as sent`
- `Release BTC`
- `Open dispute`
- `Submit appeal`

Avoid ambiguous `Continue` at commitment boundaries.

Asset and network ambiguity is critical. `USDT` alone is insufficient when network affects execution or safety.

---

## 10. Responsive Architecture

Applications are viewport-aware. Components are container-aware.

Reference ranges for design exploration:

- **NARROW**: 320–390
- **COMPACT**: 390–600
- **MEDIUM**: 600–900
- **STANDARD**: 900–1280
- **WIDE**: 1280+

These are design references, not frozen implementation breakpoints.

Information priority:

- **P0**: must remain visible
- **P1**: strongly relevant
- **P2**: contextual
- **P3**: advanced

Marketplace layouts SHOULD transform from dense tabular/list presentations on larger containers into structured rows and then stacked mobile compositions.

Mobile trade experiences MUST prioritize:

> **What do I need to do now?**

The Sails Market app shell is a reference-application concern. `sails-ui` MUST NOT impose a global navigation shell on host applications.

---

## 11. Domain Primitive Architecture

### 11.1 Value

- `Money`
- `Rate`
- `LimitRange`

Money MUST use string, decimal, bigint-compatible, or domain-safe numeric representations. JavaScript floating-point numbers MUST NOT be treated as the authoritative representation for financial amounts.

Display precision SHOULD follow transactional risk and asset conventions.

### 11.2 Asset and Rail

- `AssetIdentity`
- `NetworkIdentity`
- `AssetNetworkIdentity`

Asset and network registries MUST be extensible.

Asset identity and network identity MUST remain semantically distinct.

### 11.3 Trade

- `TradeSide`
- `TradeState`
- `TradeTimer`

Trade-state components MUST consume domain-defined state. Visual components MUST NOT infer state by inspecting unrelated fields.

### 11.4 Counterparty

- `CounterpartyIdentity`
- `Verification`
- `Presence`

Unknown presence is not offline.

### 11.5 Reputation

- `ReputationMetric`
- `ReputationSource`
- `ReputationSummary`

### 11.6 Payment and Settlement

- `PaymentMethod`
- `PaymentState`
- `SettlementState`
- `EscrowState`

Payment method, payment provider, and payment account are distinct concepts.

### 11.7 Cross-Cutting Rule

> **Visual primitives receive state. They do not discover truth.**

---

## 12. Identity, Trust, and Reputation

Sails does not tell the user whom to trust. It presents relevant evidence.

Trust presentation SHOULD preserve independent dimensions:

- Identity
- Verification
- History
- Performance
- Presence
- Sources

### 12.1 Sails Identity

Sails ID is the coordination layer over linked identity sources.

Linked sources MAY include:

- Nostr
- Pubky
- Pears
- other future sources

Sails ID MUST NOT be presented as if Nostr, Pubky, and Pears were competing duplicate identities owned independently by the same user.

### 12.2 Verification

`VerificationBadge` SHOULD preserve:

- what was verified
- source
- state
- freshness where relevant

Unknown, unverified, unavailable, loading, and verification failed MUST remain distinct.

### 12.3 Reputation

Reputation SHOULD be compositional, not a single star score.

Positive reputation data SHOULD NOT all be rendered as semantic success green.

Negative history SHOULD NOT automatically become semantic danger red.

### 12.4 Vouch

A vouch is evidence of endorsement/relationship.

A vouch is not:

- verification
- reputation itself
- proof of trustworthiness

Vouches are directional unless the domain explicitly records mutual vouching.

A burned/ended vouch MUST NOT be labeled as fraud without independent evidence.

Vouch is not transitive. Trust paths MUST NOT multiply endorsement into a synthetic probability.

### 12.5 Feedback

`PostTradeFeedback` MAY be supported when the host/protocol provides it.

Feedback is a reputation source, not reputation itself.

Feedback SHOULD preserve trade, participant, source, timestamp, role, and structured dimension where available.

---

## 13. Offers, Intent, and Discovery

### 13.1 Economic Chain

A canonical economic chain MAY be:

`Participant → Intent → Discovery → Candidate → Proposal → Negotiation → AgreedTerms → Trade → Settlement`

Not all journeys use every object.

### 13.2 Intent

Intent means:

> I want this economic outcome.

Intent may exist without an offer.

Intent SHOULD support:

- summary
- constraints
- origin
- status
- expiry
- activity
- agent attribution

### 13.3 Offer

Offer means:

> I am offering these terms.

Offer may exist without an intent.

Offer selection is interface state. Selecting an offer MUST NOT imply that a trade exists.

### 13.4 Discovery

Discovery is a process/context, not necessarily a primary persistent product destination.

Discovery may produce candidates.

### 13.5 Candidate

Candidate is a discovery result, not an agreement.

Candidate is not equivalent to Offer.

Candidate SHOULD preserve source and match rationale when available.

No match is a legitimate result, not an error.

### 13.6 Proposal and Counterproposal

Proposals are structured economic objects.

Counterproposals MUST make changed terms distinguishable. A `TermsDiff` pattern SHOULD be available.

### 13.7 AgreedTerms

Agreed terms mean that terms have been agreed.

Agreed terms are not a trade.

A commitment/review step MAY still be required to create the trade.

---

## 14. Negotiation and Coordination

Negotiation is not Chat.

Chat is one possible communication channel inside or adjacent to negotiation.

A negotiation may originate from:

- Offer
- Candidate
- Intent
- Participant
- Room
- Agent-mediated workflow

### 14.1 Message

A human text message remains a message even if it contains economic language.

Text such as “I can sell 20,000 USDT at X” MUST NOT silently become a structured proposal.

### 14.2 Structured Economic Objects

Economic objects in communication surfaces SHOULD render as structured objects, not generic message bubbles.

Examples:

- TradeIntent
- Proposal
- CounterProposal
- AgreedTerms

### 14.3 Agent Interpretation

An agent MAY interpret natural language and suggest a structured object.

Agent interpretation MUST require the appropriate review/authority before becoming user commitment.

Agent interpretation is not user intent until accepted under the relevant authority model.

---

## 15. Trade Lifecycle

### 15.1 Trade Workspace

The trade experience SHOULD answer:

1. What happened?
2. What is protected?
3. What do I need to do now?
4. What happens next?

Canonical compositions:

- TradeHeader
- CurrentAction
- TradeSummary
- FundsStatus
- TradeTimeline
- OperationalPanel
- CounterpartyContext
- Communication
- RecoveryContext

### 15.2 CurrentAction

`TradeState + ParticipantRole → Presentation Model → CurrentAction`

CurrentAction MUST be derived from domain truth and actor context.

### 15.3 Timeline vs Activity

Timeline communicates economic/process progression.
Activity records events.

They MUST NOT be treated as the same object.

### 15.4 Payment State

Payment marked as sent is not payment verified.

Seller-facing release flows SHOULD explicitly instruct independent receipt verification when external payment rails are involved.

### 15.5 Completion

Completion language MUST be factual.

Cancelled, expired, failed, disputed, refunded, and settlement failed MUST remain distinct.

---

## 16. Payment Accounts and Payment Safety

### 16.1 Separation of Concerns

- Payment Method
- Payment Account
- Payment Destination
- Payment Instructions
- Payment State

are different objects.

### 16.2 Payment Account

Payment accounts are participant-level reusable objects.

The UI SHOULD support:

- PaymentAccountList
- PaymentAccountSummary
- PaymentAccountDetails
- PaymentAccountSelector
- PaymentAccountForm
- PaymentAccountReview

Field schemas SHOULD be method-specific or adapter-driven rather than a universal mega-form full of unrelated optional fields.

### 16.3 Payment Instructions

Trade-specific payment instructions SHOULD include, where applicable:

- method
- recipient
- destination
- exact amount
- currency
- reference/memo
- deadline
- copy actions
- warnings

Exact amount is P0 information.

### 16.4 PaymentSafetyCheck

The system SHOULD support contextual safety checks such as:

- verify recipient
- verify exact amount
- verify method
- verify account ownership
- verify actual receipt
- verify reference/memo

These MUST reflect domain/host policy rather than decorative checklists.

### 16.5 PaymentMismatch

The presentation layer SHOULD be able to represent:

- amount mismatch
- recipient mismatch
- sender mismatch
- method mismatch
- reference mismatch
- unknown discrepancy

The UI MUST NOT independently decide the economic consequence.

### 16.6 PaymentReceipt

A payment receipt is material presented about a payment.

A payment receipt is not payment truth.

A receipt MAY later be referenced as dispute evidence while preserving provenance.

### 16.7 Third-Party Payment

Expected payer and observed sender MAY differ.

The UI MUST present that discrepancy factually when known. The domain decides whether it is allowed, blocked, reviewable, or disputable.

---

## 17. Custody, Escrow, Signing, and Settlement

### 17.1 Separation

Custody, escrow, signing, and settlement are distinct.

### 17.2 CustodyModel

Custody model MUST be described factually.

Do not claim “non-custodial”, “trustless”, “safe”, or equivalent guarantees unless the implementation and product definition support those claims.

If custody model is unknown, the UI MUST NOT infer one.

### 17.3 Escrow

Escrow status MAY expose:

- custody model
- funding status
- locked amount
- participant keys/signers where appropriate
- fee policy snapshot
- expiry
- pending settlement action

Escrow state and trade state are distinct.

If escrow is expired, the UI MAY say escrow expired when that state is authoritative. It MUST NOT infer that the trade itself is expired unless TradeState says so.

### 17.4 Fee Snapshot

Transaction-specific fee-policy snapshots SHOULD outrank mutable global settings when explaining an existing trade.

### 17.5 Signing

> **Never ask the user to sign bytes when the interface can explain the economic consequence.**

A SigningRequest SHOULD explain:

- action
- economic outcome
- asset
- amounts
- destinations
- fees
- network
- authority
- technical detail progressively

Raw PSBT/transaction payload SHOULD remain advanced detail.

### 17.6 SigningIntentMismatch

If the actual transaction does not match expected trade terms, signing MUST be blocked and the mismatch made explicit.

### 17.7 Signatures

Signature progress MUST be based on real signer requirements.

“2 of 3 signatures” MUST NOT be rendered as “67% settlement complete”.

All signatures collected does not necessarily mean settlement complete.

### 17.8 Unknown Signing Outcome

A timeout or uncertain wallet handoff MUST enter reconciliation rather than blind retry.

### 17.9 Wallet Boundary

`sails-ui` explains and orchestrates.

The host wallet adapter performs secure signing and returns the result.

Private keys, seeds, and raw signing secrets MUST NOT enter normal UI telemetry or logging.

---

## 18. Dispute, Evidence, Arbitration, and Appeal

### 18.1 Core Invariant

> **Claim is not Evidence. Evidence is not Verification. Verification is not Decision. Decision is not Settlement.**

### 18.2 Dispute Workspace

Canonical compositions:

- DisputeHeader
- FundsStatus
- CurrentDisputeAction
- ClaimSummary
- EvidenceList
- ArbitrationStatus
- AuthorityTrail
- DisputeTimeline
- DisputeActivity
- ResolutionStatus

### 18.3 Evidence

`EvidenceItem` SHOULD preserve:

- type
- submittedBy
- timestamp
- source
- preview
- integrity state
- verification state
- related claim/round where available

Evidence types MAY include:

- image
- document
- video
- transaction
- message
- structured record
- external record

Provenance is first-class.

OpenProof integrity MUST NOT be labeled as proof of truth.

### 18.4 Sensitive Evidence

Sensitive evidence SHOULD support progressive disclosure and future redaction workflows.

EvidenceViewer MUST treat content as untrusted.

### 18.5 ResolutionAttempt

Before formal dispute escalation, a host MAY provide direct-resolution guidance.

Direct resolution is distinct from mediation, arbitration, and settlement.

The UI MUST NOT force pre-dispute negotiation when the domain allows immediate escalation.

### 18.6 Arbitration

Dispute, arbitration, ruling, resolution, and appeal are separate.

Arbiter identity is distinct from counterparty identity.

Operational profile is distinct from verification and reputation.

### 18.7 Agent Recommendation

Agent recommendations MAY expose:

- recommendation
- reasoning
- model confidence
- source
- deadline
- authority state

Model confidence MUST be labeled as model confidence, not probability of truth.

Reasoning is not evidence.

### 18.8 Ruling

Use operational language:

- Release assets
- Refund assets
- Split settlement

Avoid moralized winner/loser language.

A ruling may still require signing, broadcast, or other settlement execution.

### 18.9 Appeal

Appeal MUST preserve prior decision history.

New rounds MUST NOT erase previous rulings or evidence provenance.

---

## 19. Spaces, Rooms, and Communication

### 19.1 Core Model

> **Space ≠ Room ≠ Chat ≠ Trade**

### 19.2 Space

Space is a semantic coordination context.

The host MAY label it:

- Community
- Desk
- Group
- Server
- Market

but the internal design-system primitive remains Space.

Space MUST NOT assume centralized server semantics.

### 19.3 Membership

Membership is not:

- verification
- reputation
- endorsement

Admin role is not economic reputation.

### 19.4 Room

Room is a contained coordination context.

A room MAY be associated with a Space, but the design system SHOULD support direct/independent coordination contexts where the domain allows them.

### 19.5 Conversation

Conversation types MAY include:

- DirectConversation
- RoomConversation
- TradeConversation

Context MUST remain visible.

### 19.6 TradeChat

TradeChat is not TradeActivity.

RoomChat is not TradeChat.

DisputeActivity is not generic Chat.

### 19.7 Invites

Invite states MAY include valid, expired, revoked, used, invalid, unknown when supported.

Invite is not Vouch.

---

## 20. Capabilities, Permissions, and Eligibility

The interface MUST distinguish:

- **Available**: service/resource works.
- **Capable**: client/wallet can perform the action.
- **Permitted**: actor is authorized.
- **Eligible**: economic/operational conditions are satisfied.

Capability is not Permission.

### 20.1 Capability Scopes

Capabilities MAY be scoped to:

- Participant
- Agent
- Space / Room
- Client / Wallet
- Execution path
- Provider

### 20.2 Capability Presentation

Canonical primitives:

- CapabilityStatus
- CapabilityRequirement
- CapabilityMismatch
- ExecutionCompatibility
- IntegrationDiagnostics

### 20.3 Action Visibility

- Hidden: irrelevant in current context.
- Disabled + explanation: relevant but unavailable.
- Visible: available.

UI visibility MUST NOT be treated as security authorization.

### 20.4 Freshness

Critical capabilities SHOULD be revalidated before commitment when staleness could invalidate execution.

### 20.5 Discovery Visibility

Discovery visibility itself MAY depend on eligibility/capability.

Not seeing an opportunity does not prove that it does not exist.

---

## 21. Agents and Delegated Authority

### 21.1 Core Invariant

> **An agent may reason, recommend, negotiate, or act. Authority still belongs to an identifiable principal and is bounded by explicit delegation.**

Participant is not Agent.
Agent is not Counterparty.
Agent is not Wallet.
Actor is not Authority.
Delegation is not generic permission.

### 21.2 Agent Identity

AgentIdentity MAY include:

- name
- provider/runtime when real data exists
- principal
- status

Implementation technology such as QVAC MUST NOT become the semantic “type” of all agents.

### 21.3 Attribution

When an agent acts:

`Sails Agent — acting for Alan`

The participant remains the economic principal.

In agent-to-agent negotiation, the economic relationship remains participant-to-participant.

### 21.4 Delegation

Delegation SHOULD answer:

- who is the principal?
- which agent?
- what actions?
- what economic constraints?
- which approval boundaries?
- validity/revocation state?

Avoid vague autonomy sliders such as Low / Medium / High.

### 21.5 Delegation Scope

Scopes SHOULD use concrete actions, for example:

- discover
- compare
- propose
- counter
- accept terms
- create trade
- release escrow

Only capabilities actually supported by the domain may be exposed.

### 21.6 Approval

ApprovalRequirement and ApprovalRequest SHOULD clearly separate:

- agent proposal
- human review
- human approval
- protocol acceptance
- execution

Human approval does not necessarily mean the action has executed.

### 21.7 Authority History

Historical agent actions SHOULD preserve the authority/delegation context that existed when the action happened.

Current delegation settings MUST NOT reinterpret old actions.

### 21.8 Signing Authority

Delegated economic authority is distinct from possession of cryptographic signing keys.

### 21.9 Human Takeover

Pause, revoke, and human-takeover patterns MAY be presented when domain-supported.

They SHOULD communicate concrete consequence, not dramatic “AI kill switch” language.

---

## 22. Resilience and Recovery

### 22.1 Core Rule

> **Degrade capability, not user understanding.**

Canonical resilience states:

- EMPTY
- LOADING
- STALE
- OFFLINE
- DEGRADED
- UNAVAILABLE
- FAILED
- CONFLICT
- EXPIRED
- UNKNOWN

### 22.2 Loading

Initial load and background refresh are different.

Background refresh SHOULD retain usable last-known-good content when safe.

### 22.3 Stale

Stale data SHOULD remain visibly stale when freshness matters.

The system SHOULD use consequence-based stale policy. Not every stale field has the same risk.

### 22.4 Offline

Offline is not trade failure.

If known trade state is available, it SHOULD remain visible with an offline notice.

### 22.5 Partial Failure

Partial data failure SHOULD remain partial. One unavailable reputation source MUST NOT erase identity or trade state.

### 22.6 Unknown Outcome

Timeout is not failure.

Critical uncertain operations MUST support `UnknownOutcome`.

Examples:

- create trade
- mark payment sent
- submit dispute
- submit appeal
- release/refund/split
- signature submission
- delegation change

UnknownOutcome SHOULD reconcile current truth before retry.

### 22.7 ReconciliationState

The UI SHOULD explain:

- the action may already have happened
- why retry may be unsafe
- what is being checked
- whether retry is now safe

### 22.8 Conflict

Conflicting sources SHOULD be represented as conflict rather than silently choosing a source.

### 22.9 Read Only

`ReadOnlyMode` SHOULD preserve visibility while disabling mutation when appropriate.

Maintenance, offline, degraded service, and outage MUST remain distinct.

### 22.10 RecoveryAction

Recovery actions MUST be domain/context driven.

---

## 23. Time, Deadlines, and Waiting

### 23.1 Time Objects

The system SHOULD distinguish:

- Deadline
- Countdown
- TimeWindow
- Expiry
- Timeout

A timer displays time.
The domain defines the consequence of expiry.

### 23.2 Authoritative Time

Critical deadlines SHOULD prefer authoritative timestamps and synchronized/reference time where available.

### 23.3 WaitingFor

`WaitingFor` SHOULD answer:

- which actor?
- expected action?
- deadline?
- consequence?
- when did waiting begin?

“Waiting for Maria to respond” is preferable to generic “Pending” when the domain knows the responsible actor.

WaitingFor MAY apply to:

- trade
- payment
- signing
- dispute
- appeal
- negotiation
- agent approval

---

## 24. External Execution and Observation

P2P economic activity may occur partially outside Sails.

### 24.1 ExternalExecutionContext

Examples:

- bank transfer
- PIX
- cash
- external wallet
- payment processor

### 24.2 ObservationSource

Where provenance matters, consequential state SHOULD preserve how it became known.

Examples:

- participant declaration
- counterparty confirmation
- provider report
- network observation
- protocol state
- signed evidence

The UI SHOULD use source-aware language such as:

- “Buyer marked payment as sent”
- “Payment provider reports completed”
- “Seller confirmed receipt”

rather than collapsing all observations into “Payment completed”.

### 24.3 External Irreversibility

> **External economic action may survive internal cancellation.**

Cancel Trade is not Undo Payment.

When an irreversible external action may already have occurred, the UI SHOULD require reconciliation before encouraging retry or recreation.

---

## 25. Commitment Boundaries

A `CommitmentBoundary` is a UX property for actions that create meaningful economic, authority, reputation, or dispute consequences.

Examples:

- Accept offer
- Create trade
- Mark payment sent
- Release funds
- Open dispute
- Submit appeal
- Authorize agent

Consequential actions SHOULD use friction proportional to consequence.

A possible conceptual scale:

- Low: reversible / non-economic
- Medium: coordination or reputation consequence
- High: economic, authority, or dispute consequence
- Critical: irreversible asset movement or signing

This is not a visible risk score.

Do not use confirmation dialogs mechanically. Review and confirmation SHOULD exist where consequence demands it.

---

## 26. Continuation Context

Re-entry SHOULD reconstruct responsibility after:

- app restart
- deep link
- offline period
- wallet handoff
- delayed asynchronous transition

A returning user SHOULD be able to understand:

- where am I?
- what changed?
- what do I need to do now?

Pending economic responsibility SHOULD outrank new discovery.

---

## 27. Component Architecture

### 27.1 Layer A — Foundations

Examples:

- Text
- Icon
- Button
- Input
- Select
- Tabs
- Badge
- Status
- Surface
- Dialog
- Sheet
- Tooltip

### 27.2 Layer B — Domain Primitives

Examples:

- Money
- Rate
- AssetIdentity
- NetworkIdentity
- TradeSide
- TradeState
- CounterpartyIdentity
- Verification
- ReputationMetric
- PaymentMethod
- EscrowState

### 27.3 Layer C — Economic Compositions

Examples:

- OfferRow
- CounterpartyCard
- TradeSummary
- TradeComposer
- TradeReview
- IntentComposer
- CandidateSummary
- NegotiationWorkspace
- CurrentAction
- PaymentInstructions
- PaymentSafetyCheck
- SigningRequest
- EvidenceItem
- AgentApproval
- WaitingFor

Sails Market route-level screens are not automatically a fourth package layer.

### 27.4 Patterns

The documentation MAY publish reusable patterns such as:

- Offer Marketplace Pattern
- Trade Workspace Pattern
- Negotiation Pattern
- Dispute Pattern
- Agent Approval Pattern

Patterns teach composition without forcing an entire application shell.

---

## 28. Component Contract

Every economically meaningful component SHOULD define the relevant subset of:

- Economic Meaning
- Source of Truth
- Authority
- Anatomy
- Interaction States
- Allowed Actions
- Loading
- Empty
- Stale
- Offline
- Unavailable
- Conflict
- Error
- Unknown Outcome
- Responsive Behavior
- Keyboard
- Screen Reader
- Touch
- Reduced Motion
- Localization
- Telemetry Semantics
- Freshness
- Mutability
- Terminality

This contract is more important than raw component count.

---

## 29. Sails Market Reference Application

Sails Market is the reference product implementation for the design system.

It is not the definition of every host application.

### 29.1 Jobs

Primary user jobs:

1. Find opportunity
2. Express an offer or intent
3. Evaluate counterparty
4. Negotiate terms
5. Execute and monitor trade
6. Resolve a problem
7. Coordinate people and automation

Supporting jobs include:

- manage identity
- manage payment accounts
- manage vouches
- manage delegations
- inspect capabilities
- integration diagnostics
- settings

### 29.2 Entry Points

Legitimate entry points include:

- Market
- Intent
- Space
- Peer
- Trade deep link
- Dispute deep link
- Agent Approval deep link
- Invite

### 29.3 Information Architecture

Reference primary destinations:

- Market
- Spaces
- Trades
- You

Transversal surfaces:

- Action Inbox
- Notifications
- Conversations
- Search

Protocol module names SHOULD NOT appear as primary navigation simply because they are architecturally important.

### 29.4 Action Inbox

Action Inbox is not Notification Center and not Activity.

It represents responsibility that requires user action or decision.

Critical financial actions MUST NOT be buried among generic notifications.

### 29.5 Market

Market may contain:

- Explore
- My Offers
- My Intents
- Discovery results

Intent belongs conceptually to Market, not necessarily primary global navigation.

Discovery is a process, not a mandatory destination.

### 29.6 Spaces

Spaces exist for economic coordination, not generic social networking.

Rooms and communication SHOULD preserve Space context.

### 29.7 Trades

Reference grouping:

- Needs Action
- Active
- History

Dispute remains contextual to Trade.

There is no required global “Disputes” or “Appeals” destination.

### 29.8 You

May include:

- Identity
- Reputation
- Relationships
- Payment Accounts
- Automation
- Settings

Agent authority management belongs under Automation in the reference app, while contextual approvals may deep-link directly from Action Inbox.

### 29.9 Origin Context

Trade may preserve origin context such as Space, Room, Offer, Intent, or Negotiation without becoming hierarchically owned by that origin.

Origin is not Parent.

---

## 30. Core Object Relationships

The design system SHOULD preserve these conceptual distinctions:

- Participant is not Account, Wallet, or Identity Source.
- Peer is a participant viewed relationally/contextually.
- Counterparty is a participant viewed in an economic relationship.
- Space is context, not universal parent.
- Room may be contextual to Space but direct coordination may exist without Space.
- Chat is communication, not economic truth.
- Intent is independent of Offer.
- Candidate is not Offer.
- Negotiation is not Chat.
- AgreedTerms is not Trade.
- Trade does not require Space.
- Trade does not require Chat.
- PaymentAccount is not owned by Trade.
- PaymentInstructions are trade-context data.
- Escrow and TradeState are distinct.
- SigningRequest is not Settlement.
- Claim is not Evidence.
- Evidence need not be owned exclusively by a Claim.
- Ruling is not Settlement.
- Vouch is independent of Trade.
- Agent does not replace Participant.
- Capability/Permission are cross-cutting.
- Action Inbox / Notification / Activity are projections, not sources of truth.

---

## 31. Canonical Economic Journeys

The reference system SHOULD support these complete journeys:

### 31.1 Market Offer → Trade
`Market → Offer → Counterparty Evaluation → TradeComposer → TradeReview → Commit → TradeWorkspace`

### 31.2 Intent → Discovery → Trade
`Intent → Discovery → Candidate → Proposal ↔ CounterProposal → AgreedTerms → TradeReview → Trade`

### 31.3 Space → Negotiation → Trade
`Space → Room/Conversation → Structured Negotiation → AgreedTerms → Trade`

### 31.4 Trade Execution
`Trade → Escrow/Funding → Payment → Payment Declaration → Verification → Release/Signing → Settlement`

Exact ordering MAY differ by settlement rail and MUST follow domain truth.

### 31.5 Dispute
`Trade → ResolutionAttempt? → Dispute → Claim/Evidence → Arbitration → Ruling → Appeal? → Settlement/Resolution`

### 31.6 Agent-Mediated
`Participant → Delegation → Agent → Intent/Discovery → Negotiation → Approval → Trade`

### 31.7 Recovery
Every critical journey MUST define recovery behavior for timeout, offline, stale state, unknown outcome, and retry safety.

---

## 32. Screen and Composition Inventory

Reference route/workspace families:

- Market
- Intent
- Spaces
- Space
- Room
- Participant
- Trades
- Trade
- Dispute
- You
- Automation
- Action Inbox
- Conversations
- System State

A state change SHOULD NOT automatically create a new screen.

### Screen
Route-level product destination.

### Workspace
Rich environment centered on one economic/context object.

### Composition
Reusable arrangement of components.

### Overlay
Dialog, Sheet, Drawer, Popover, Menu, Tooltip.

---

## 33. System and Empty States

The system SHOULD provide reusable patterns for:

- Unauthorized
- Private Resource
- Resource Unavailable
- Not Found
- Maintenance
- Read Only
- Offline
- Capability Mismatch
- Unsupported Client

Empty-state families:

- No Data
- No Results
- No Activity
- No Permission
- Not Configured

Do not invent cheerful decorative illustrations when direct explanation is more useful.

---

## 34. Operational Profiles

Participants MAY have domain-defined operational profiles such as:

- liquidity provider
- merchant
- cashier
- arbitrator
- space operator

These are host/protocol concepts, not universal Sails roles.

Operational role is not reputation.

Role is not verification unless the role itself is backed by a specific verification claim.

---

## 35. White-Label and Theming Contract

Hosts MAY override:

- brand primary
- brand supporting color
- neutral palette
- typography
- density defaults
- radius defaults
- application shell

Hosts MUST preserve:

- semantic status meaning
- trade-side semantic separation
- asset/network identity
- accessibility contrast
- state distinctions
- economic hierarchy
- provenance and authority semantics

Theme overrides MUST NOT turn semantic success into danger, hide critical warnings, or recolor official asset/network identities into misleading states.

---

## 36. Governance

### 36.1 Source of Truth

This file is the durable design-system specification.

Stitch is the visual laboratory for exploring:

- layouts
- component appearance
- responsive behavior
- flows
- prototypes

Stitch is not the institutional source of truth.

### 36.2 Implementation

Engineering implementation SHOULD consume approved design decisions rather than invent new product semantics ad hoc.

Significant semantic deviations from this file SHOULD be reviewed as design-system changes.

### 36.3 Protocol Reality

If repository/domain reality contradicts this document, the contradiction MUST be resolved explicitly.

The UI MUST NOT preserve a visual rule by inventing unsupported protocol behavior.

### 36.4 Quality Standard

Design-system maturity is not measured by the number of components.

The meaningful question is:

> **Can a host application compose every canonical economic journey without inventing missing semantics or rebuilding the UX from scratch?**

---

## 37. Explicitly Unfrozen Decisions

The following remain intentionally open until prototype/accessibility validation:

- exact orange and blue hex values
- final semantic color values
- final neutral scale values
- exact responsive implementation breakpoints
- exact motion durations within the approved bands
- final Sails Market app-shell choice
- exact desktop navigation treatment
- exact mobile navigation treatment
- exact placement/combination of Action Inbox and Notifications
- some overlay-vs-route choices for high-information mobile flows

These decisions MUST NOT be silently frozen by a single implementation experiment.

---

## 38. Explicitly Retired Rules

The following older rules are no longer authoritative:

- “one accent color only”
- mandatory black + orange brand system
- “no shadows ever”
- literal Tailwind status colors as institutional semantic tokens
- green = BUY/success as a single shared semantic
- red = SELL/danger as a single shared semantic
- purple = QVAC by default
- financial amounts defaulting to monospace
- one universal 8px radius for all surfaces
- desktop top-nav and mobile bottom-nav as already-frozen app-shell architecture
- exact old RGB/hex values as permanent institutional tokens

These may still appear in legacy implementation until code is migrated. Their presence does not override this specification.
