# Graph Report - .  (2026-07-31)

## Corpus Check
- 379 files · ~333,237 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3028 nodes · 5498 edges · 200 communities (137 shown, 63 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 45 edges (avg confidence: 0.72)
- Token cost: 959,545 input · 0 output

## Community Hubs (Navigation)
- k6 Load Testing Scenarios
- Architecture Component Inventory
- Intent Type Definitions
- Escrow Service & Settlement Providers
- Protocol Specification Primitives
- SDK Bitcoin Taproot Custody
- Governance & Philosophy Docs
- Server Bootstrap & Core Wiring
- Custody Invariant & Reference Implementations
- Route Integration Tests
- sails-ui Package Dependencies
- Event Bus & Event Types
- Integration Starter Event Handling
- SDK Public Modules (Escrow/Liquidity)
- Integration Starter Dependencies
- SDK Cryptography Dependencies
- Marketplace UI Components
- Whitepapers & Deployment Docs
- sails-ui App Shell & Layout
- Marketplace Cards & Badges
- config cluster
- modules/open-p2p cluster
- common/errors cluster
- tests cluster
- sails-ui/lib cluster
- sails-ui/lib cluster
- lightning-hodl.provider.ts internals
- sails-sdk/modules cluster
- docs cluster
- tsconfig.json internals
- sails-sdk/src cluster
- sails-sdk/modules cluster
- modules/open-p2p cluster
- multisig.provider.ts internals
- sails-sdk/src cluster
- sdk-react/components/trade cluster
- core cluster
- sails-sdk/modules cluster
- sails-ui/src cluster
- modules/open-settlement cluster
- infrastructure/p2p cluster
- package.json internals
- modules/open-liquidity cluster
- infrastructure/p2p cluster
- docs cluster
- tsconfig.json internals
- sdk-react/tests/hooks cluster
- common/events cluster
- docs cluster
- escrow.service.ts internals
- escrowReleaseControls.test.ts internals
- package.json internals
- docs cluster
- package.json internals
- tsconfig.json internals
- modules/open-settlement cluster
- escrowProviderWiring.test.ts internals
- package.json internals
- trade.page.ts internals
- sails-sdk/tests cluster
- sails-ui/lib cluster
- sdk-react/components/feedback cluster
- modules/open-agents cluster
- infrastructure/p2p cluster
- tsconfig.json internals
- sails-ui/lib cluster
- tsconfig.json internals
- local-postgres.js internals
- modules/open-proof cluster
- docs cluster
- sails-sdk/src cluster
- sails-ui/lib cluster
- modules/open-agents cluster
- e2e/pages cluster
- sails-sdk/custody cluster
- sdk-react/components/trade cluster
- modules/open-agents cluster
- modules/open-settlement cluster
- sails-sdk/src cluster
- typedoc.json internals
- settlement.routes.ts internals
- tsconfig.json internals
- package.json internals
- sdk-react/hooks cluster
- intentCapabilityCheck.test.ts internals
- tsconfig.json internals
- sdk-react/components/identity cluster
- websocket-relay.service.ts internals
- modules/open-settlement cluster
- disputeFlow.test.ts internals
- package.json internals
- sdk-react/components/feedback cluster
- modules/open-agents cluster
- reputationOutcome.test.ts internals
- package.json internals
- e2e/pages cluster
- package.json internals
- core cluster
- market-arbitration.provider.ts internals
- modules/open-settlement cluster
- package.json internals
- concurrency.spec.ts internals
- examples/sails-integration-starter/app cluster
- trade.ts internals
- local-redis.js internals
- infrastructure/p2p cluster
- socialEngineeringDetection.test.ts internals
- home.page.ts internals
- pregenerate-users.js internals
- package.json internals
- sails-sdk/modules cluster
- payment-account.ts internals
- pear.service.ts internals
- e2e/flows cluster
- package.json internals
- package.json internals
- negotiation.service.ts internals
- autoSettleHandler.test.ts internals
- qvac-forgery.test.ts internals
- settlementOrchestrator.test.ts internals
- sails-p2p-schemas/src cluster
- setup.ts internals
- modules/open-agents cluster
- escrow.service.ts internals
- escrow-with-arbitration.ts internals
- processor.js internals
- package.json internals
- race-condition.test.ts internals
- global-setup.ts internals
- p2p-bitcoin-trade.ts internals
- index.ts internals
- package.json internals
- event-bus.ts internals
- policy-engine.ts internals
- types.d.ts internals
- hardhat.config.ts internals
- playwright.config.ts internals
- package.json internals
- package.json internals
- next.config.ts internals
- next-env.d.ts internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- jest.config.js internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- package.json internals
- main.ts internals
- RFC-003 internals
- RFC-004 internals
- RFC-011 internals

## God Nodes (most connected - your core abstractions)
1. `RFC-007: Real-World P2P Requirements` - 38 edges
2. `SailsTransport` - 37 edges
3. `EscrowService` - 29 edges
4. `LightningHodlProvider` - 27 edges
5. `SailsClient` - 24 edges
6. `MultisigProvider` - 24 edges
7. `TradePage` - 23 edges
8. `prisma` - 22 edges
9. `scripts` - 21 edges
10. `requireAuth()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `checkRedis()` --references--> `redis`  [EXTRACTED]
  e2e/global-setup.ts → src/common/redis/index.ts
- `sails-integration-starter API.md` --references--> `RFC-013 Capability Registry and Wallet Adapter`  [EXTRACTED]
  examples/sails-integration-starter/docs/API.md → rfcs/RFC-013-capability-registry-and-wallet-adapter.md
- `sails-sdk CHANGELOG.md` --references--> `RFC-013 Capability Registry and Wallet Adapter`  [EXTRACTED]
  packages/sails-sdk/CHANGELOG.md → rfcs/RFC-013-capability-registry-and-wallet-adapter.md
- `sails-integration-starter API.md` --references--> `RFC-014 Capability Registry Enforcement`  [EXTRACTED]
  examples/sails-integration-starter/docs/API.md → rfcs/RFC-014-capability-registry-enforcement.md
- `sails-integration-starter USE_CASES.md` --references--> `RFC-020 Non-Custodial EVM Settlement`  [EXTRACTED]
  examples/sails-integration-starter/docs/USE_CASES.md → rfcs/RFC-020-non-custodial-evm-settlement.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sails Protocol Core — 6 Formal Components** — intent_engine, coordination_engine, event_bus, state_machine, capability_registry, policy_engine [EXTRACTED 0.95]
- **The 8 Official Sails Protocol Modules** — openidentity_module, openreputation_module, opensettlement_module, openliquidity_module, openproof_module, openp2p_module, openagents_module, openfinance_module [EXTRACTED 0.95]
- **Security/Trust Documentation Bundle** — docs_cryptographic_model, docs_trust_boundary, docs_threat_model, docs_security_model [INFERRED 0.70]
- **The Nine Core Primitives of Sails Protocol** — docs_protocol_specification, docs_protocol_specification_identity_primitive, docs_protocol_specification_intent_primitive, docs_protocol_specification_discovery_primitive, docs_protocol_specification_negotiation_primitive, docs_protocol_specification_settlement_primitive, docs_protocol_specification_reputation_primitive, docs_protocol_specification_agent_primitive, docs_protocol_specification_proof_primitive, docs_protocol_specification_dispute_primitive [EXTRACTED 0.95]
- **WdkSettlementProvider Custody-Invariant Violation, Documented Across Docs** — docs_protocol_invariants, docs_security_model, docs_trust_boundary, docs_todo, docs_rfcs_rfc_019_settlement_custody_reference_vs_normative, docs_rfcs_rfc_020_non_custodial_evm_settlement [EXTRACTED 0.90]
- **WDK + Pears + QVAC as Sails Protocol's Foundational Infrastructure** — docs_project_context, docs_project_context_wdk, docs_project_context_pears, docs_project_context_qvac, docs_protocol_specification [EXTRACTED 0.90]
- **Adapter Pattern Interfaces (TransportProvider, EvidenceProvider, ArbitrationProvider, TimestampAnchor, EventStore)** — docs_rfcs_rfc_002_transport_provider_transportprovider, docs_rfcs_rfc_007_real_world_p2p_requirements_evidenceprovider, docs_rfcs_rfc_007_real_world_p2p_requirements_arbitrationprovider, docs_rfcs_rfc_008_verifiable_timestamps_and_chained_timeline_timestampanchor, docs_rfcs_rfc_010_durable_event_store_eventstore [EXTRACTED 0.90]
- **Capability / CapabilityGrant / Package Terminology Disambiguation Lineage** — docs_rfcs_rfc_005_capability_model_capability, docs_rfcs_rfc_005_capability_model_capabilitygrant, docs_rfcs_rfc_006_openproof_module_and_packages_package [EXTRACTED 0.90]
- **Timeline / Evidence Integrity Design Lineage (RFC-007, RFC-008, RFC-010)** — docs_rfcs_rfc_007_real_world_p2p_requirements, docs_rfcs_rfc_008_verifiable_timestamps_and_chained_timeline, docs_rfcs_rfc_010_durable_event_store [EXTRACTED 0.85]
- **Capability Registry Implementation, Enforcement, and Two-Person Control Lineage (RFC-013/014/015)** — docs_rfcs_rfc_013_capability_registry_and_wallet_adapter, docs_rfcs_rfc_014_capability_registry_enforcement, docs_rfcs_rfc_015_dual_authorization_escrow_release [EXTRACTED 0.90]
- **Non-Custodial Settlement and Market-Based Trust Lineage (RFC-019/020/021)** — docs_rfcs_rfc_019_settlement_custody_reference_vs_normative, docs_rfcs_rfc_020_non_custodial_evm_settlement, docs_rfcs_rfc_021_market_based_arbitration_and_payment_trust [EXTRACTED 0.85]
- **Intent/Trade Lifecycle Observability and Canonicalization Lineage (RFC-011/012/017/018)** — docs_rfcs_rfc_011_p2p_reconciliation, docs_rfcs_rfc_012_intent_validation_and_coordination, docs_rfcs_rfc_017_timeline_and_social_engineering_agent, docs_rfcs_rfc_018_intent_as_canonical_trade_entry_point [INFERRED 0.75]
- **sails-integration-starter example documentation set** — examples_sails_integration_starter, examples_sails_integration_starter_readme, examples_sails_integration_starter_docs_api, examples_sails_integration_starter_docs_architecture, examples_sails_integration_starter_docs_faq, examples_sails_integration_starter_docs_use_cases [EXTRACTED 0.90]
- **Four companion whitepapers (Marketing/Protocol/SDK/Technical)** — docs_whitepapers_marketing_whitepaper, docs_whitepapers_protocol_paper, docs_whitepapers_sdk_paper, docs_whitepapers_technical_whitepaper [EXTRACTED 0.95]
- **Load-testing / performance verification suites (k6 + Artillery) closing the Technical Whitepaper's disclosed throughput gap** — load_tests_readme, loadtest_readme, loadtest_chat_ws, loadtest_intent_api, docs_whitepapers_technical_whitepaper [INFERRED 0.80]

## Communities (200 total, 63 thin omitted)

### Community 0 - "k6 Load Testing Scenarios"
Cohesion: 0.07
Nodes (56): BASE_URL, baseOptions, options, setup, runMixedWorkload(), setupMixedWorkload(), options, setup (+48 more)

### Community 1 - "Architecture Component Inventory"
Cohesion: 0.06
Nodes (62): common/middleware/auth.ts, BitcoinCustodyProvider (MuSig2), BuyerAgent, Capability Registry, Coordination Engine, demo-satsails-qvac.ts, dispute.service.ts, docker-compose.yml (+54 more)

### Community 2 - "Intent Type Definitions"
Cohesion: 0.05
Nodes (50): Intent, IntentHandler, IntentPayload, IntentStatus, IntentType, TradeIntentPayload, RFC-006, RFC-009 (+42 more)

### Community 3 - "Escrow Service & Settlement Providers"
Cohesion: 0.05
Nodes (23): MockSettlementProvider, SettlementProvider, deserializeUserOp(), ethereumAddressFromCompressedHex(), recoverSignerAddress(), SafeGuardBundle, SafeGuardEvmEscrowInput, SafeGuardEvmProvider (+15 more)

### Community 4 - "Protocol Specification Primitives"
Cohesion: 0.06
Nodes (58): Identity Primitive, Participant interface, Proof Primitive, Settlement Primitive, SettlementAdapter pattern, SettlementProvider interface, RFC Index, RFC-001: Participant Model (+50 more)

### Community 5 - "SDK Bitcoin Taproot Custody"
Cohesion: 0.07
Nodes (35): aggregateLeaf(), BitcoinCustodyProvider, EscrowRulingPath, MuSig2SigningRound, signerPairFor(), RFC-020, addressToWord(), bytes32ToWord() (+27 more)

### Community 6 - "Governance & Philosophy Docs"
Cohesion: 0.05
Nodes (48): 04-Deepseek Review.md (not in repo), Principle 5: Capability Based, Principle 4: Fiat Off-Protocol, Principle 6: Infrastructure Neutral, Principle 2: Intent Driven, Principle 9: Interface Agnostic, Principle 7: Open Integrations, Principle 8: Privacy Preserving (+40 more)

### Community 7 - "Server Bootstrap & Core Wiring"
Cohesion: 0.07
Nodes (44): buildApp(), startServer(), RFC-018, RFC-019, connectDatabase(), registerEventHandlers(), requireAuth(), resolveParticipantFromToken() (+36 more)

### Community 8 - "Custody Invariant & Reference Implementations"
Cohesion: 0.06
Nodes (46): QVAC (Tether), Constitutional Invariant 2: The Protocol Never Custodies Assets, dLocal, Fireblocks MPC, Lightspark Grid, SailsPay (future Reference Implementation), RFC-014: Capability Registry Enforcement, config.features.enforceCapabilities flag (+38 more)

### Community 9 - "Route Integration Tests"
Cohesion: 0.04
Nodes (46): { buildApp }, mockArbiterProfileCreate, mockArbiterProfileFindUnique, mockArbiterProfileUpdate, mockCapabilityGrantCreate, mockCapabilityGrantFindMany, mockCapabilityGrantFindUnique, mockCapabilityGrantUpdate (+38 more)

### Community 10 - "sails-ui Package Dependencies"
Cohesion: 0.04
Nodes (46): autoprefixer, dependencies, react, react-dom, react-router-dom, recharts, @sails/sdk, sonner (+38 more)

### Community 11 - "Event Bus & Event Types"
Cohesion: 0.04
Nodes (42): ArbiterSlashedEvent, ClaimAssertedEvent, IntentCancelledEvent, IntentCommittedEvent, IntentCoordinatedEvent, IntentCreatedEvent, IntentDiscoveringEvent, IntentExpiredEvent (+34 more)

### Community 12 - "Integration Starter Event Handling"
Cohesion: 0.06
Nodes (12): ChannelLike, TradeEventHandler, assertDecimalString(), buildBuyIntent(), buildSellIntent(), BuildTradeIntentInput, buildTradeIntentPayload(), RFC-009 (+4 more)

### Community 13 - "SDK Public Modules (Escrow/Liquidity)"
Cohesion: 0.09
Nodes (36): RFC-019, RFC-020, ArkPendingBundle, signEscrowArkTx(), DiscoverResult, LiquidityOfferSummary, MatchInput, OrderBook (+28 more)

### Community 14 - "Integration Starter Dependencies"
Cohesion: 0.05
Nodes (42): dependencies, next, react, react-dom, @sails/sdk, @sails/sdk-react, @tanstack/react-query, tweetnacl (+34 more)

### Community 15 - "SDK Cryptography Dependencies"
Cohesion: 0.05
Nodes (41): @bitcoinerlab/secp256k1, @noble/curves, @noble/hashes, dependencies, @arkade-os/sdk, @aws-sdk/client-kms, @bitcoinerlab/secp256k1, bitcoinjs-lib (+33 more)

### Community 16 - "Marketplace UI Components"
Cohesion: 0.09
Nodes (31): AssetPicker(), Props, CurrencyPicker(), Props, FilterPanel(), Props, SORT_OPTIONS, TIME_LIMITS (+23 more)

### Community 17 - "Whitepapers & Deployment Docs"
Cohesion: 0.14
Nodes (29): examples/sails-integration-starter (example app), sails-integration-starter API.md, sails-integration-starter ARCHITECTURE.md, sails-integration-starter FAQ.md, sails-integration-starter USE_CASES.md, sails-integration-starter README.md, examples/simple-wallet (example app), simple-wallet README.md (+21 more)

### Community 18 - "sails-ui App Shell & Layout"
Cohesion: 0.10
Nodes (27): App(), ThemedToaster(), BottomNav(), items, Layout(), TopNav(), ThemeToggle(), deterministicOnline() (+19 more)

### Community 19 - "Marketplace Cards & Badges"
Cohesion: 0.10
Nodes (29): OfferCard(), AssetBadge(), ESCROW_STATUS_COLOR, ESCROW_STATUS_LABEL, OfferStatusBadge(), PaymentBadge(), SideBadge(), TRADE_STATUS_COLOR (+21 more)

### Community 20 - "config cluster"
Cohesion: 0.08
Nodes (27): RFC-012, issueChallenge(), toBytes(), verifySignedChallenge(), connectRedis(), redis, config, RFC-007 (+19 more)

### Community 21 - "modules/open-p2p cluster"
Cohesion: 0.07
Nodes (25): adapter, prisma, NOTE: In this reference implementation, OpenP2P's Trade-status writes, RFC-007, RFC-011, RFC-017, RFC-018, RFC-021 (+17 more)

### Community 22 - "common/errors cluster"
Cohesion: 0.09
Nodes (17): AppError, AuthError, EscrowError, ForbiddenError, NotFoundError, ValidationError, RegisterParticipantInput, ReputationOutcome (+9 more)

### Community 23 - "tests cluster"
Cohesion: 0.06
Nodes (26): TrustedArbitratorProvider, RFC-007, RFC-021, disputes, { DisputeService }, escrowEvents, escrows, { escrowService } (+18 more)

### Community 24 - "sails-ui/lib cluster"
Cohesion: 0.14
Nodes (27): AgentIntentionPanel(), Props, AgentRiskCard(), Props, RECOMMENDATION_LABEL, RISK_STYLE, NEGOTIATION_PROFILES, NegotiationMandate (+19 more)

### Community 25 - "sails-ui/lib cluster"
Cohesion: 0.11
Nodes (23): ChatMessage(), ChatWindow(), Props, EscrowCountdown(), formatRemaining(), EscrowStatusBadge(), InfoTooltip(), formatDateTime() (+15 more)

### Community 26 - "lightning-hodl.provider.ts internals"
Cohesion: 0.15
Nodes (6): ArkEscrowInput, ArkParties, ArkPendingBundle, LightningHodlProvider, seedFor(), toXOnly()

### Community 27 - "sails-sdk/modules cluster"
Cohesion: 0.12
Nodes (15): bytesToHex(), hexToBytes(), utf8ToBytes(), ECPair, EscrowKeypair, generateEscrowKeypair(), signEscrowPsbt(), AuthenticateResult (+7 more)

### Community 28 - "docs cluster"
Cohesion: 0.08
Nodes (26): The Five Minute Test, The Named-SDK Rule, The One Sentence Test, Sails OpenFinance (module), Sails OpenP2P (module), Pears (Holepunch), Satsails Wallet / Reference Wallet, The Three-Level Hierarchy (+18 more)

### Community 29 - "tsconfig.json internals"
Cohesion: 0.07
Nodes (28): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+20 more)

### Community 30 - "sails-sdk/src cluster"
Cohesion: 0.11
Nodes (14): ERROR_CODE_MAP, errorFromResponseBody(), SailsAuthError, SailsError, SailsErrorResponseBody, SailsEscrowError, SailsForbiddenError, SailsInternalError (+6 more)

### Community 31 - "sails-sdk/modules cluster"
Cohesion: 0.12
Nodes (7): SailsOpenP2PModule, RateInput, SailsReputationModule, RFC-007, SailsTransport, ReputationScore, Trade

### Community 32 - "modules/open-p2p cluster"
Cohesion: 0.08
Nodes (17): OfferStatus, TradeStatus, OfferPagination, OfferRow, RFC-009, RFC-018, NegotiationEvent, NegotiationService (+9 more)

### Community 33 - "multisig.provider.ts internals"
Cohesion: 0.15
Nodes (7): bip32, ExplorerUtxo, keyIndexFor(), MultisigEscrowInput, MultisigParties, MultisigProvider, networkFor()

### Community 34 - "sails-sdk/src cluster"
Cohesion: 0.11
Nodes (12): SailsClientOptions, RFC-013, RFC-021, RegisterCapabilityInput, SailsCapabilitiesModule, RFC-013, SailsTransportOptions, CapabilityGrant (+4 more)

### Community 35 - "sdk-react/components/trade cluster"
Cohesion: 0.08
Nodes (25): badgeBaseStyle, ESCROW_STATUS_COLOR, ESCROW_STATUS_LABEL, EscrowStatusBadge(), EscrowStatusBadgeProps, AllEscrowStatuses, AllTradeStatuses, EscrowCompleted (+17 more)

### Community 36 - "core cluster"
Cohesion: 0.09
Nodes (19): Capability, CapabilityGrant, CapabilityImplementation, RFC-005, RFC-006, CAPABILITY_IMPLEMENTATIONS, CapabilityRegistry, RFC-005 (+11 more)

### Community 37 - "sails-sdk/modules cluster"
Cohesion: 0.15
Nodes (5): SailsPeersModule, SailsSettlementModule, Dispute, Escrow, EscrowPendingTransaction

### Community 38 - "sails-ui/src cluster"
Cohesion: 0.10
Nodes (22): EscrowActions(), Props, TODO: POST /v1/settlement/escrow/:id/lock (escrow.service.ts's lockFunds()), TODO: POST /v1/settlement/escrow/:id/payment-sent (markPaymentSent()), TODO: POST /v1/settlement/escrow/:id/release (releaseFunds()) —, TODO: POST /v1/settlement/escrow/:id/dispute (dispute.service.ts's…, RFC-014, EscrowStateMachine() (+14 more)

### Community 39 - "modules/open-settlement cluster"
Cohesion: 0.10
Nodes (23): EscrowStatus, EscrowType, CreateEscrowInput, EscrowRecord, NON_CUSTODIAL_PROVIDERS, PROVIDERS, NOTE: previously this method also called prisma.trade.update(...) to set, NOTE: previously this method also updated Trade.status/completedAt AND (+15 more)

### Community 40 - "infrastructure/p2p cluster"
Cohesion: 0.12
Nodes (5): FallbackTransportProvider, PearsTransportProvider, mockPearNodeGet, mockUserFindUnique, { pearsTransportProvider }

### Community 41 - "package.json internals"
Cohesion: 0.08
Nodes (25): artillery, @axe-core/playwright, embedded-postgres, jest, devDependencies, artillery, @axe-core/playwright, embedded-postgres (+17 more)

### Community 42 - "modules/open-liquidity cluster"
Cohesion: 0.15
Nodes (9): AssetType, TradeSide, CreateOfferInput, HodlHodlProvider, InternalOrderBook, LiquidityOffer, LiquidityProvider, LiquidityRouter (+1 more)

### Community 43 - "infrastructure/p2p cluster"
Cohesion: 0.10
Nodes (9): PearNode, PearPeer, TOPICS, RFC-002, RFC-010, RFC-011, verifyHandshakeIdentity(), mockUserFindUnique (+1 more)

### Community 44 - "docs cluster"
Cohesion: 0.11
Nodes (21): Sails P2P Trading SDK, Capability Registry (Core component), RFC-005: Capability Model, Capability (interface), CapabilityGrant (interface), CapabilityImplementation (interface), OperationalProfileGrant (D8, OpenIdentity addition), RFC-013: Capability Registry Implementation, WalletAdapter Pattern, Portable Identity (+13 more)

### Community 45 - "tsconfig.json internals"
Cohesion: 0.08
Nodes (23): compilerOptions, esModuleInterop, jsx, lib, module, moduleResolution, noEmit, skipLibCheck (+15 more)

### Community 46 - "sdk-react/tests/hooks cluster"
Cohesion: 0.20
Nodes (9): SailsContext, SailsProvider(), preview, renderWithProviders(), RenderWithProvidersOptions, createMockSailsClient(), MockSailsClientOptions, mockEscrow() (+1 more)

### Community 47 - "common/events cluster"
Cohesion: 0.11
Nodes (12): emit(), getEvents(), on(), SailsEventMap, SailsEventName, DurableEvent, EventStore, InMemoryEventStore (+4 more)

### Community 48 - "docs cluster"
Cohesion: 0.09
Nodes (21): CapabilityGrant model, Claim model, Dispute model, EscrowEvent model, Escrow model, EscrowReleaseApproval model, EvidenceReference model, EvidenceVerification model (+13 more)

### Community 50 - "escrowReleaseControls.test.ts internals"
Cohesion: 0.09
Nodes (20): baseEscrow, { escrowService }, { eventBus }, mockApprovalCount, mockApprovalFindMany, mockApprovalUpsert, mockCapabilityGrantFindMany, mockDisputeFindFirst (+12 more)

### Community 51 - "package.json internals"
Cohesion: 0.10
Nodes (20): @account-abstraction/contracts, dependencies, @account-abstraction/contracts, @openzeppelin/contracts, @safe-global/safe-4337, @safe-global/safe-contracts, description, devDependencies (+12 more)

### Community 52 - "docs cluster"
Cohesion: 0.10
Nodes (18): MASTER_COORDINATION.md, RFC-018: Intent as the Canonical Entry Point for Every Trade, Offer/Trade.intentId foreign key, OpenP2PTradeIntentHandler, Capability Registry enforcement gap, Implementation Freeze (declared 2026-07-19), Missing Files audit, OpenAgents — QvacAgentProvider + BuyerAgent/SellerAgent (+10 more)

### Community 53 - "package.json internals"
Cohesion: 0.10
Nodes (21): scripts, build, build:ui, db:generate, db:local:start, db:local:stop, db:migrate, db:seed (+13 more)

### Community 54 - "tsconfig.json internals"
Cohesion: 0.10
Nodes (20): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, noFallthroughCasesInSwitch (+12 more)

### Community 55 - "modules/open-settlement cluster"
Cohesion: 0.12
Nodes (19): ArbiterCandidate, K_ELIGIBILITY, OVERTURNED_PENALTY, PANEL_SIZE_BASE, REPUTATION_STAKE_FACTOR, SLASH_COLLATERAL_FRACTION, RFC-007, RFC-009 (+11 more)

### Community 56 - "escrowProviderWiring.test.ts internals"
Cohesion: 0.10
Nodes (18): mockBuildUnsignedRefund, mockBuildUnsignedRelease, mockEscrowCreate, mockEscrowEventCreate, mockEscrowFindUnique, mockEscrowUpdate, mockEscrowUpdateMany, mockFinalizeRefund (+10 more)

### Community 57 - "package.json internals"
Cohesion: 0.11
Nodes (19): @chromatic-com/storybook, jsdom, devDependencies, @chromatic-com/storybook, jsdom, @storybook/react, @testing-library/dom, @testing-library/user-event (+11 more)

### Community 59 - "sails-sdk/tests cluster"
Cohesion: 0.12
Nodes (4): WebSocketChannel, authedTransport(), authedTransport(), FakeSocket

### Community 60 - "sails-ui/lib cluster"
Cohesion: 0.22
Nodes (13): PartyRow(), TradeParties(), FavoriteButton(), getFavoriteTraderIds(), isFavoriteTrader(), readFavorites(), toggleFavoriteTrader(), writeFavorites() (+5 more)

### Community 61 - "sdk-react/components/feedback cluster"
Cohesion: 0.14
Nodes (15): Dismissible, Error, Info, meta, Success, TriggeredViaProvider, TriggerToastDemo(), Toast() (+7 more)

### Community 62 - "modules/open-agents cluster"
Cohesion: 0.13
Nodes (12): getTimeline(), TimelineEntry, RiskPattern, RiskSignal, SocialEngineeringAgent, RFC-007, RFC-017, mockCompletion (+4 more)

### Community 63 - "infrastructure/p2p cluster"
Cohesion: 0.13
Nodes (7): PeerHandle, TransportProvider, RFC-001, RFC-002, RFC-008, RFC-002, RFC-010

### Community 64 - "tsconfig.json internals"
Cohesion: 0.11
Nodes (17): compilerOptions, declaration, esModuleInterop, lib, module, moduleResolution, outDir, rootDir (+9 more)

### Community 65 - "sails-ui/lib cluster"
Cohesion: 0.18
Nodes (14): OFFER_STATUS_LABEL, PowerTraderBadge(), CopyButton(), ASSET_SHORT_LABELS, addOffer(), getAllOffers(), TODO: replace with @sails/sdk `liquidity.createOffer()` (real route:, readCreatedOffers() (+6 more)

### Community 66 - "tsconfig.json internals"
Cohesion: 0.11
Nodes (17): demo-satsails-qvac.ts, packages/sails-p2p-schemas/src/index.ts, compilerOptions, baseUrl, esModuleInterop, module, moduleResolution, outDir (+9 more)

### Community 67 - "local-postgres.js internals"
Cohesion: 0.19
Nodes (17): binDir(), DATA_DIR, ensureDatabase(), { execFileSync }, fs, initdb(), isInitialised(), RFC-018 (+9 more)

### Community 68 - "modules/open-proof cluster"
Cohesion: 0.13
Nodes (11): assertClaimSchema, submitProofSchema, verifyProofSchema, AssertClaimInput, canonicalize(), hashEvidence(), ProofService, SubmitProofInput (+3 more)

### Community 69 - "docs cluster"
Cohesion: 0.12
Nodes (16): Ark (Arkade), Bisq, Ethereum and L2s, Fedimint / Fedi, Hodl Hodl, Lightning Network, Liquid Network, Nostr (+8 more)

### Community 70 - "sails-sdk/src cluster"
Cohesion: 0.12
Nodes (4): SailsClient, ArbiterCandidate, SailsArbitrationModule, RFC-021

### Community 71 - "sails-ui/lib cluster"
Cohesion: 0.19
Nodes (14): bytesToHex(), CLIENT_KEY_ESCROW_TYPES, hexToBytes(), loadOrCreateEscrowKeypair(), StoredEscrowKeypair, useEscrowKey(), fetchAllPages(), fetchOffers() (+6 more)

### Community 72 - "modules/open-agents cluster"
Cohesion: 0.13
Nodes (15): FiatCurrency, PaymentMethod, AssessableIntent, IntentRiskAssessment, OFFER_INTENT_SCHEMA, RISK_ASSESSMENT_SCHEMA, RiskLevel, RiskRecommendation (+7 more)

### Community 73 - "e2e/pages cluster"
Cohesion: 0.26
Nodes (5): test, WalletFixtures, RFC-007, RFC-011, CreateTradePage

### Community 74 - "sails-sdk/custody cluster"
Cohesion: 0.22
Nodes (10): ethereumAddressFromUncompressedPubkey(), extractUncompressedPubkeyFromSpki(), parseDerSignature(), SailsSignerService, SailsSignerServiceConfig, Secp256k1Signature, toEthereumSignature(), RFC-019 (+2 more)

### Community 75 - "sdk-react/components/trade cluster"
Cohesion: 0.14
Nodes (14): cardBaseStyle, roleLabel(), AllStates, Clickable, Compact, Default, Detailed, meta (+6 more)

### Community 76 - "modules/open-agents cluster"
Cohesion: 0.18
Nodes (5): QvacAgentProvider, WalletAgent, WalletAgentConfig, capturedHistory, { QvacAgentProvider }

### Community 77 - "modules/open-settlement cluster"
Cohesion: 0.18
Nodes (6): DisputeRuling, DisputeSchema, DisputeStatus, EvidenceDescriptor, ArbitrationProvider, DisputeService

### Community 78 - "sails-sdk/src cluster"
Cohesion: 0.15
Nodes (8): NegotiationEvent, ProofSubmission, SailsIntentFacade, RFC-003, RFC-018, Intent, IntentStatus, TradeIntentPayload

### Community 79 - "typedoc.json internals"
Cohesion: 0.13
Nodes (14): categorizeByGroup, entryPoints, excludeInternal, excludePrivate, name, navigation, includeCategories, includeGroups (+6 more)

### Community 80 - "settlement.routes.ts internals"
Cohesion: 0.13
Nodes (14): createEscrowSchema, disputeSchema, getDisputeService(), initiateReleaseSchema, registerArbiterSchema, registerPaymentAccountSchema, releaseSchema, resolveSchema (+6 more)

### Community 81 - "tsconfig.json internals"
Cohesion: 0.14
Nodes (13): compilerOptions, esModuleInterop, lib, module, moduleResolution, noEmit, skipLibCheck, strict (+5 more)

### Community 82 - "package.json internals"
Cohesion: 0.14
Nodes (13): description, devDependencies, typescript, files, dist, typescript, license, main (+5 more)

### Community 83 - "sdk-react/hooks cluster"
Cohesion: 0.33
Nodes (8): useSailsClient(), useSailsEscrow(), UseSailsEscrowResult, useSailsTrade(), useSailsTrades(), UseSailsTradesOptions, SailsProviderProps, useSailsContext()

### Community 84 - "intentCapabilityCheck.test.ts internals"
Cohesion: 0.14
Nodes (12): { intentEngine }, mockCheck, mockEmit, mockIntentCreate, mockIntentEventCreate, mockIntentEventFindFirst, mockIntentFindUnique, mockIntentUpdateMany (+4 more)

### Community 85 - "tsconfig.json internals"
Cohesion: 0.15
Nodes (12): compilerOptions, declaration, esModuleInterop, module, moduleResolution, outDir, rootDir, skipLibCheck (+4 more)

### Community 86 - "sdk-react/components/identity cluster"
Cohesion: 0.19
Nodes (10): ReputationBadge(), ReputationBadgeProps, Default, HighDisputeRate, meta, NewTrader, NoDisplayName, NoDisputes (+2 more)

### Community 88 - "modules/open-settlement cluster"
Cohesion: 0.22
Nodes (11): ESTABLISHED_TRADE_COUNT, ESTABLISHED_TRADE_LIMIT, SIGNED_TRADE_LIMIT, TRUSTED_TRADE_COUNT, RFC-021, UNSIGNED_TRADE_LIMIT, mockPaymentAccountCreate, mockPaymentAccountFindUnique (+3 more)

### Community 89 - "disputeFlow.test.ts internals"
Cohesion: 0.15
Nodes (11): { DisputeService }, mockDisputeCreate, mockDisputeFindUnique, mockDisputeUpdate, mockEmit, mockEscrowFindUnique, mockOpenDispute, mockRefundFunds (+3 more)

### Community 91 - "package.json internals"
Cohesion: 0.17
Nodes (11): description, exports, files, dist, license, main, module, name (+3 more)

### Community 92 - "sdk-react/components/feedback cluster"
Cohesion: 0.21
Nodes (9): ensureKeyframes(), Skeleton(), SkeletonProps, Avatar, Block, CardSkeletonComposition, meta, Story (+1 more)

### Community 93 - "modules/open-agents cluster"
Cohesion: 0.20
Nodes (7): BuyerAgent, RFC-016, GeneratedTradeIntent, mockCompletion, mockLoadModel, mockUnloadModel, RFC-009

### Community 94 - "reputationOutcome.test.ts internals"
Cohesion: 0.17
Nodes (11): handlers, mockDisputeFindFirst, mockEmit, mockEscrowFindUnique, mockIntentTransition, mockTradeUpdate, mockUserUpdate, { registerEventHandlers } (+3 more)

### Community 95 - "package.json internals"
Cohesion: 0.18
Nodes (10): description, engines, node, license, main, name, repository, type (+2 more)

### Community 96 - "e2e/pages cluster"
Cohesion: 0.24
Nodes (3): SailsFixtures, test, WalletPage

### Community 97 - "package.json internals"
Cohesion: 0.20
Nodes (9): dependencies, @sails/sdk, description, @sails/sdk, name, private, scripts, start (+1 more)

### Community 98 - "core cluster"
Cohesion: 0.20
Nodes (6): Timeline, RFC-007, RFC-010, RFC-017, RFC-007, RFC-017

### Community 100 - "modules/open-settlement cluster"
Cohesion: 0.24
Nodes (3): PaymentAccountService, { PaymentAccountService }, RFC-021

### Community 101 - "package.json internals"
Cohesion: 0.22
Nodes (9): b4a, @fastify/swagger, dependencies, @aws-sdk/client-kms, b4a, @fastify/swagger, pg, @aws-sdk/client-kms (+1 more)

### Community 102 - "concurrency.spec.ts internals"
Cohesion: 0.36
Nodes (8): auth(), bytesToHex(), createTrade(), Identity, publishOffer(), readyEscrowForRelease(), registerAndAuth(), utf8ToBytes()

### Community 103 - "examples/sails-integration-starter/app cluster"
Cohesion: 0.33
Nodes (4): metadata, Providers(), getSailsClient(), resolveBaseUrl()

### Community 104 - "trade.ts internals"
Cohesion: 0.22
Nodes (8): deriveTradeState(), DisputeStatusInput, EscrowStatusInput, TradeSchema, TradeState, TradeStatusInput, RFC-008, RFC-011

### Community 105 - "local-redis.js internals"
Cohesion: 0.25
Nodes (7): binaryPath(), fs, LOG_FILE, path, PID_FILE, { spawn, execSync }, start()

### Community 106 - "infrastructure/p2p cluster"
Cohesion: 0.36
Nodes (7): decryptFromPeer(), Ed25519KeyPair, ed25519PublicKeyToCurve25519(), ed25519SecretKeyToCurve25519(), encryptForPeer(), RFC-001, RFC-002

### Community 107 - "socialEngineeringDetection.test.ts internals"
Cohesion: 0.22
Nodes (7): durableMessageEvent, mockEmit, mockEvaluate, onDurableHandlers, onHandlers, { registerEventHandlers }, RFC-017

### Community 109 - "pregenerate-users.js internals"
Cohesion: 0.32
Nodes (7): COUNT, createAuthenticatedUser(), fs, main(), nacl, path, toHex()

### Community 110 - "package.json internals"
Cohesion: 0.25
Nodes (8): overrides, brace-expansion, find-my-way, react, react-dom, tar, uuid, valibot

### Community 112 - "payment-account.ts internals"
Cohesion: 0.25
Nodes (3): PaymentAccount, SailsPaymentAccountModule, RFC-021

### Community 114 - "e2e/flows cluster"
Cohesion: 0.33
Nodes (5): SettlementFixtures, test, test, RFC-012, RFC-018

### Community 115 - "package.json internals"
Cohesion: 0.29
Nodes (7): react, react-dom, react, react-dom, peerDependencies, react, react-dom

### Community 116 - "package.json internals"
Cohesion: 0.29
Nodes (7): scripts, build, build-storybook, storybook, test, test:watch, typecheck

### Community 118 - "autoSettleHandler.test.ts internals"
Cohesion: 0.29
Nodes (5): handlers, mockExecuteSettlement, mockGetAccountAddress, { registerEventHandlers }, tradeCreatedPayload

### Community 119 - "qvac-forgery.test.ts internals"
Cohesion: 0.29
Nodes (5): fakeClaims, fakeProofs, fakeRedisStore, mockEmit, { proofService }

### Community 120 - "settlementOrchestrator.test.ts internals"
Cohesion: 0.29
Nodes (6): { executeSettlement }, mockCreateEscrow, mockLockFunds, mockMarkPaymentSent, mockReleaseFunds, mockTradeFindUnique

### Community 122 - "sails-p2p-schemas/src cluster"
Cohesion: 0.40
Nodes (4): OfferRecord, OfferSchema, toOfferSchema(), toString()

### Community 124 - "modules/open-agents cluster"
Cohesion: 0.40
Nodes (3): GeneratedOfferIntent, GeneratedOffer, SellerAgent

### Community 126 - "escrow-with-arbitration.ts internals"
Cohesion: 0.60
Nodes (4): fixedArbiterKeypair(), main(), step(), RFC-007

### Community 127 - "processor.js internals"
Cohesion: 0.50
Nodes (3): nacl, setupAuthenticatedUser(), toHex()

### Community 128 - "package.json internals"
Cohesion: 0.40
Nodes (5): dependencies, @sails/sdk, @tanstack/react-query, @sails/sdk, @tanstack/react-query

### Community 129 - "race-condition.test.ts internals"
Cohesion: 0.40
Nodes (4): { escrowService }, fakeDb, mockDisputeFindFirst, RFC-021

### Community 130 - "global-setup.ts internals"
Cohesion: 0.83
Nodes (3): checkPostgres(), checkRedis(), globalSetup()

### Community 131 - "p2p-bitcoin-trade.ts internals"
Cohesion: 0.83
Nodes (3): main(), step(), waitForMessage()

### Community 132 - "index.ts internals"
Cohesion: 0.83
Nodes (3): main(), step(), waitForMessage()

### Community 133 - "package.json internals"
Cohesion: 0.50
Nodes (4): workspaces, contracts, examples/*, packages/*

### Community 134 - "event-bus.ts internals"
Cohesion: 0.50
Nodes (4): DisputeAppealedEvent, DisputeEvent, DisputeOpenedEvent, DisputeResolvedEvent

### Community 136 - "types.d.ts internals"
Cohesion: 0.50
Nodes (3): b4a, hyperdht, hyperswarm

## Ambiguous Edges - Review These
- `Capability Registry (Core component)` → `Capability Registry (Core component)`  [AMBIGUOUS]
  docs/PROTOCOL_SPECIFICATION.md · relation: references
- `WalletAdapter interface` → `WalletAuthorizedSettlementProvider (target architecture, name TBD)`  [AMBIGUOUS]
  docs/rfcs/RFC-019-settlement-custody-reference-vs-normative.md · relation: conceptually_related_to
- `@sails/sdk (Sails P2P Trading SDK)` → `@sails/ui (reference UI)`  [AMBIGUOUS]
  packages/sails-ui/README.md · relation: depends_on

## Knowledge Gaps
- **1166 isolated node(s):** `config`, `RFC-020`, `name`, `version`, `description` (+1161 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **63 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Capability Registry (Core component)` and `Capability Registry (Core component)`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `WalletAdapter interface` and `WalletAuthorizedSettlementProvider (target architecture, name TBD)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `@sails/sdk (Sails P2P Trading SDK)` and `@sails/ui (reference UI)`?**
  _Edge tagged AMBIGUOUS (relation: depends_on) - confidence is low._
- **Why does `hashPaymentAccount()` connect `sails-sdk/modules cluster` to `modules/open-settlement cluster`, `SDK Public Modules (Escrow/Liquidity)`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `prisma` connect `modules/open-p2p cluster` to `modules/open-p2p cluster`, `Intent Type Definitions`, `core cluster`, `modules/open-proof cluster`, `Server Bootstrap & Core Wiring`, `modules/open-settlement cluster`, `infrastructure/p2p cluster`, `config cluster`, `common/errors cluster`, `modules/open-settlement cluster`, `modules/open-settlement cluster`, `infrastructure/p2p cluster`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `PaymentAccountService` connect `modules/open-settlement cluster` to `modules/open-settlement cluster`, `settlement.routes.ts internals`, `modules/open-agents cluster`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **What connects `config`, `RFC-020`, `name` to the rest of the system?**
  _1166 weakly-connected nodes found - possible documentation gaps or missing edges._